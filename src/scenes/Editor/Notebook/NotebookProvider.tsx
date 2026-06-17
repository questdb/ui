import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import type { MutableRefObject } from "react"
import { unstable_batchedUpdates } from "react-dom"
import { useEditor } from "../../../providers/EditorProvider"
import { QuestContext } from "../../../providers/QuestProvider"
import type {
  CellLayoutItem,
  NotebookCell,
  NotebookVariable,
  NotebookViewState,
  NotebookSettings,
  CellMode,
  CellType,
} from "../../../store/notebook"
import type { ChartConfig } from "./CellChart/chartTypes"
import { useQueryExecution } from "../../../hooks/useQueryExecution"
import { useCellsStore } from "./useCellsStore"
import { useCellExecution } from "./useCellExecution"
import { useNotebookPersistence } from "./useNotebookPersistence"
import {
  createNotebookController,
  registerController,
  unregisterController,
  type NotebookControllerActions,
} from "../../../utils/notebookAIBridge"
import {
  computeResultBottomHeight,
  DEFAULT_CHART_BOTTOM_HEIGHT,
  sqlHash,
} from "./notebookUtils"
import {
  deleteCellSnapshot,
  loadNotebookSnapshots,
} from "../../../store/notebookResults"
import type { QueryKey } from "../../../store/Query/types"

// State and actions live in SEPARATE contexts: action-only consumers never
// re-render when state changes (the actions value is ref-stable for life).

export type NotebookState = {
  cells: NotebookCell[]
  settings: NotebookSettings
  focusedCellId: string | null
  maximizedCellId: string | null
  runningCellIds: Set<string>
  // True until persisted result snapshots have been loaded on mount. Cells that
  // had a result (lastRunStatus set) reserve their result area + show a spinner
  // while this is true, so the hydrated grid lands without elongating the cell.
  isHydrating: boolean
}

export type NotebookActions = {
  getVariables: () => NotebookVariable[] | undefined
  updateSettings: (updates: Partial<NotebookSettings>) => void
  addCell: (afterCellId?: string, value?: string, type?: CellType) => string
  deleteCell: (cellId: string) => void
  updateCell: (cellId: string, updates: Partial<NotebookCell>) => void
  moveCellUp: (cellId: string) => void
  moveCellDown: (cellId: string) => void
  duplicateCell: (cellId: string) => string
  runCell: (
    cellId: string,
    sql?: string,
    signal?: AbortSignal,
  ) => Promise<boolean>
  cancelCell: (cellId: string) => void
  cancelQuery: (cellId: string, index: number) => void
  setActiveResultIndex: (cellId: string, index: number) => void
  setCellMode: (cellId: string, mode: CellMode) => void
  setCellChartConfig: (cellId: string, config: ChartConfig) => void
  setCellAutoRefresh: (cellId: string, value: boolean) => void
  setCellChartMaximized: (cellId: string, value: boolean) => void
  setCellLayout: (
    cellId: string,
    pos: { x: number; y: number; w: number; h: number },
  ) => void
  setFocusedCell: (cellId: string | null) => void
  setMaximizedCellId: (cellId: string | null) => void
  getCellsSnapshot: () => NotebookCell[]
}

export type NotebookContextType = NotebookState & NotebookActions

type LiveNotebookActions = NotebookActions & NotebookControllerActions

type ActionMap = Record<string, (...args: never[]) => unknown>

const NOOP_ACTIONS: NotebookActions = {
  getVariables: () => undefined,
  updateSettings: () => undefined,
  addCell: () => "",
  deleteCell: () => undefined,
  updateCell: () => undefined,
  moveCellUp: () => undefined,
  moveCellDown: () => undefined,
  duplicateCell: () => "",
  runCell: () => Promise.resolve(false),
  cancelCell: () => undefined,
  cancelQuery: () => undefined,
  setActiveResultIndex: () => undefined,
  setCellMode: () => undefined,
  setCellChartConfig: () => undefined,
  setCellAutoRefresh: () => undefined,
  setCellChartMaximized: () => undefined,
  setCellLayout: () => undefined,
  setFocusedCell: () => undefined,
  setMaximizedCellId: () => undefined,
  getCellsSnapshot: () => [],
}

const NOOP_LIVE_ACTIONS: LiveNotebookActions = {
  ...NOOP_ACTIONS,
  getSettings: () => ({}),
  getMaximizedCellId: () => null,
  updateCells: () => undefined,
}

const NOTEBOOK_ACTION_KEYS = Object.keys(NOOP_ACTIONS) as Array<
  keyof NotebookActions
>

const createStableActionProxy = <T extends ActionMap, K extends keyof T>(
  ref: MutableRefObject<T>,
  keys: K[],
): Pick<T, K> =>
  Object.fromEntries(
    keys.map((key) => [
      key,
      (...args: Parameters<T[K]>) => ref.current[key](...args),
    ]),
  ) as Pick<T, K>

const EMPTY_STATE: NotebookState = {
  cells: [],
  settings: {},
  focusedCellId: null,
  maximizedCellId: null,
  runningCellIds: new Set(),
  isHydrating: false,
}

const createNotebookQueryKey = (
  bufferId: number,
  cellId: string,
  runId: number,
): QueryKey => `notebook:${bufferId}:${cellId}:run-${runId}@0-0` as QueryKey

const createNotebookScopeKey = (bufferId: number, cellId: string): string =>
  `notebook:${bufferId}:${cellId}`

const NotebookStateContext = createContext<NotebookState>(EMPTY_STATE)
const NotebookActionsContext = createContext<NotebookActions>(NOOP_ACTIONS)

export const useNotebookState = () => useContext(NotebookStateContext)
export const useNotebookActions = () => useContext(NotebookActionsContext)

export const useNotebook = (): NotebookContextType => {
  const state = useNotebookState()
  const actions = useNotebookActions()
  return useMemo(() => ({ ...state, ...actions }), [state, actions])
}

export const NotebookProvider: React.FC<{
  initialState: NotebookViewState
  bufferId: number
}> = ({ initialState, bufferId, children }) => {
  const { updateBuffer } = useEditor()
  const { questExecution } = useContext(QuestContext)

  const [focusedCellId, setFocusedCellState] = useState<string | null>(
    initialState.focusedCellId ?? null,
  )
  const [maximizedCellId, setMaximizedCellIdState] = useState<string | null>(
    () =>
      initialState.maximizedCellId &&
      initialState.cells.some((c) => c.id === initialState.maximizedCellId)
        ? initialState.maximizedCellId
        : null,
  )
  const [settings, setSettingsState] = useState<NotebookSettings>(
    initialState.settings ?? {},
  )

  const focusedCellIdRef = useRef(focusedCellId)
  const maximizedCellIdRef = useRef(maximizedCellId)
  const settingsRef = useRef(settings)
  const activeCellQueryKeysRef = useRef<Map<string, QueryKey>>(new Map())
  const notebookRunIdRef = useRef(0)
  const liveActionsRef = useRef<LiveNotebookActions>(NOOP_LIVE_ACTIONS)

  const { executeSingle } = useQueryExecution(settings.variables)

  const { persistCells, persistImmediately } = useNotebookPersistence({
    bufferId,
    updateBuffer,
    focusedCellIdRef,
    maximizedCellIdRef,
    settingsRef,
  })

  const store = useCellsStore({
    initialCells: initialState.cells,
    persistCells,
  })

  // Restore persisted result snapshots on mount. Results are stripped before
  // persist, so cells load empty; rehydrate each from its bounded snapshot when
  // the cell's SQL still matches and no live result has landed yet. Cells that
  // had a result (`lastRunStatus` set — known synchronously) reserve their
  // result area + show a spinner while `isHydrating`, so the grid lands in
  // place rather than elongating the cell once this async load resolves.
  const { hydrateCells, cellsRef } = store
  const [hydrationSettled, setHydrationSettled] = useState(false)
  useEffect(() => {
    let cancelled = false
    loadNotebookSnapshots(bufferId)
      .then((snapshots) => {
        if (cancelled) return
        const byCell = new Map(snapshots.map((s) => [s.cellId, s]))
        hydrateCells((prev) =>
          prev.map((cell) => {
            if (cell.result) return cell
            const snap = byCell.get(cell.id)
            if (!snap || snap.sqlHash !== sqlHash(cell.value)) return cell
            return {
              ...cell,
              result: {
                results: snap.results,
                activeResultIndex: 0,
                timestamp: snap.savedAt,
              },
            }
          }),
        )
        const liveCellIds = new Set(cellsRef.current.map((c) => c.id))
        snapshots
          .filter((s) => !liveCellIds.has(s.cellId))
          .forEach((s) => void deleteCellSnapshot(bufferId, s.cellId))
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setHydrationSettled(true)
      })
    return () => {
      cancelled = true
    }
  }, [bufferId, hydrateCells])

  const execution = useCellExecution({
    bufferId,
    cellsRef,
    executeSingle,
    updateCellResult: store.updateCellResult,
    updateCell: store.updateCell,
    updateCells: store.updateCells,
    markCancelledAll: store.markCancelledAll,
    markCancelledOne: store.markCancelledOne,
    setScriptSummary: store.setScriptSummary,
  })

  const setFocusedCell = useCallback((cellId: string | null) => {
    focusedCellIdRef.current = cellId
    setFocusedCellState(cellId)
  }, [])

  const updateSettings = useCallback(
    (updates: Partial<NotebookSettings>) => {
      const next = { ...settingsRef.current, ...updates }
      settingsRef.current = next
      setSettingsState(next)
      persistImmediately(store.cellsRef.current)
    },
    [persistImmediately, store.cellsRef],
  )

  const setMaximizedCellId = useCallback(
    (cellId: string | null) => {
      maximizedCellIdRef.current = cellId
      setMaximizedCellIdState(cellId)
      persistImmediately(store.cellsRef.current)
    },
    [persistImmediately, store.cellsRef],
  )

  const setCellLayout = useCallback(
    (cellId: string, pos: { x: number; y: number; w: number; h: number }) => {
      const prev = settingsRef.current
      const layout = prev.layout ?? []
      const idx = layout.findIndex((l) => l.i === cellId)
      const nextLayout: CellLayoutItem[] =
        idx >= 0
          ? layout.map((l) => (l.i === cellId ? { ...l, ...pos } : l))
          : [...layout, { i: cellId, ...pos }]
      const next = { ...prev, layout: nextLayout }
      settingsRef.current = next
      setSettingsState(next)
      persistImmediately(store.cellsRef.current)
    },
    [persistImmediately, store.cellsRef],
  )

  // In grid mode, freshly added cells must land in `settings.layout` so
  // mergeCellLayout has a real position entry to read. The `h` value
  // written here is a placeholder — the actual rendered grid h is derived
  // at render time from cell.topHeight + cell.bottomHeight (see
  // computeCellGridH).
  const addCell = useCallback(
    (afterCellId?: string, value?: string, type?: CellType): string => {
      let newId = ""
      unstable_batchedUpdates(() => {
        newId = store.addCell(afterCellId, value, type)
        if (settingsRef.current.layoutMode !== "grid") return
        const layout = settingsRef.current.layout ?? []
        const maxY =
          layout.length > 0 ? Math.max(...layout.map((l) => l.y + l.h)) : 0
        // h = 1 sentinel; computeCellGridH overrides at render.
        setCellLayout(newId, { x: 0, y: maxY, w: 12, h: 1 })
      })
      return newId
    },
    [store, setCellLayout],
  )

  // Mode toggle: when a cell flips between run and draw, seed bottomHeight
  // with the mode-appropriate default. This puts the cell into double-view
  // immediately for draw, and back to single-view (or result-double-view)
  // for run.
  const setCellMode = useCallback(
    (cellId: string, mode: CellMode) => {
      store.setCellMode(cellId, mode)
      if (mode === "draw") {
        store.updateCell(cellId, { bottomHeight: DEFAULT_CHART_BOTTOM_HEIGHT })
      } else {
        // back to run mode: size the bottom slot based on what the
        // existing result actually contains (DQL-with-rows → 10-row
        // height; DDL/DML/error/empty → notification-only). No result
        // yet → drop to single-view by clearing bottomHeight.
        const cell = store.cellsRef.current.find((c) => c.id === cellId)
        store.updateCell(cellId, {
          bottomHeight: cell?.result
            ? computeResultBottomHeight(cell.result)
            : undefined,
        })
      }
    },
    [store],
  )

  const cancelCell = useCallback(
    (cellId: string) => {
      execution.cancelCell(cellId)

      const queryKey = activeCellQueryKeysRef.current.get(cellId)
      if (queryKey) {
        activeCellQueryKeysRef.current.delete(cellId)
        questExecution.releaseExecution(
          queryKey,
          createNotebookScopeKey(bufferId, cellId),
        )
      }
    },
    [bufferId, execution, questExecution],
  )

  const runCellNow = useCallback(
    async (
      cellId: string,
      queryKey: QueryKey,
      scopeKey: string,
      sql?: string,
      signal?: AbortSignal,
    ) => {
      activeCellQueryKeysRef.current.set(cellId, queryKey)

      try {
        const ok = await execution.runCell(cellId, sql, signal)
        // Every run (success OR error) puts the cell into result-double-view.
        // Height is conditioned on the actual result shape so DDL/DML/empty-
        // DQL/error results don't reserve 10 blank rows of space. Any prior user
        // drag of the bottom handle is discarded on re-run.
        const cell = store.cellsRef.current.find((c) => c.id === cellId)
        if (cell && cell.mode !== "draw" && cell.type !== "markdown") {
          store.updateCell(cellId, {
            bottomHeight: computeResultBottomHeight(cell.result),
          })
        }

        return ok
      } finally {
        if (activeCellQueryKeysRef.current.get(cellId) === queryKey) {
          activeCellQueryKeysRef.current.delete(cellId)
          questExecution.releaseExecution(queryKey, scopeKey)
        }
      }
    },
    [execution, questExecution, store],
  )

  const runCell = useCallback(
    async (cellId: string, sql?: string, signal?: AbortSignal) => {
      const runId = ++notebookRunIdRef.current
      const queryKey = createNotebookQueryKey(bufferId, cellId, runId)
      const scopeKey = createNotebookScopeKey(bufferId, cellId)

      return new Promise<boolean>((resolve) => {
        const execute = () => {
          void runCellNow(cellId, queryKey, scopeKey, sql, signal).then(resolve)
        }
        const request = () =>
          questExecution.requestExecution({
            abort: () => cancelCell(cellId),
            bufferId,
            execute,
            onDismiss: () => resolve(false),
            queryKey,
            scopeKey,
          })

        if (signal) {
          questExecution.dismissPending(scopeKey)
          questExecution.abortActiveByScope(scopeKey)
          request()
          return
        }

        request()
      })
    },
    [bufferId, cancelCell, questExecution, runCellNow],
  )

  const deleteCell = useCallback(
    (cellId: string) => {
      cancelCell(cellId)
      store.removeCellById(cellId)
      void deleteCellSnapshot(bufferId, cellId)
      if (focusedCellIdRef.current === cellId) {
        setFocusedCell(null)
      }
      if (maximizedCellIdRef.current === cellId) {
        setMaximizedCellId(null)
      }
    },
    [store, setMaximizedCellId, cancelCell, bufferId],
  )

  const duplicateCell = useCallback(
    (cellId: string): string => {
      // batchedUpdates ensures the cells append and the layout entry land
      // in a single render. React 17 doesn't auto-batch outside event
      // handlers (Radix DropdownMenu defers onSelect via setTimeout), so
      // without this the duplicate flashes at the bottom before snapping
      // into place.
      let newId = ""
      unstable_batchedUpdates(() => {
        newId = store.duplicateCell(cellId)
        if (settingsRef.current.layoutMode !== "grid") return
        const layout = settingsRef.current.layout ?? []
        const original = layout.find((l) => l.i === cellId)
        if (!original) return
        setCellLayout(newId, {
          x: original.x,
          y: original.y,
          w: original.w,
          h: original.h,
        })
      })
      return newId
    },
    [store, setCellLayout],
  )

  liveActionsRef.current = {
    getVariables: () => settingsRef.current.variables,
    updateSettings,
    addCell,
    deleteCell,
    updateCell: store.updateCell,
    moveCellUp: store.moveCellUp,
    moveCellDown: store.moveCellDown,
    duplicateCell,
    runCell,
    cancelCell,
    cancelQuery: execution.cancelQuery,
    setActiveResultIndex: execution.setActiveResultIndex,
    setCellMode,
    setCellChartConfig: store.setCellChartConfig,
    setCellAutoRefresh: store.setCellAutoRefresh,
    setCellChartMaximized: store.setCellChartMaximized,
    setCellLayout,
    setFocusedCell,
    setMaximizedCellId,
    getCellsSnapshot: () => store.cellsRef.current.slice(),
    getSettings: () => ({ ...settingsRef.current }),
    getMaximizedCellId: () => maximizedCellIdRef.current,
    updateCells: store.updateCells,
  }

  const stateValue = useMemo<NotebookState>(
    () => ({
      cells: store.cells,
      settings,
      focusedCellId,
      maximizedCellId,
      runningCellIds: execution.runningCellIds,
      isHydrating: !hydrationSettled,
    }),
    [
      store.cells,
      settings,
      focusedCellId,
      maximizedCellId,
      execution.runningCellIds,
      hydrationSettled,
    ],
  )

  const actionsValue = useMemo<NotebookActions>(
    () => createStableActionProxy(liveActionsRef, NOTEBOOK_ACTION_KEYS),
    [],
  )

  useEffect(() => {
    const activeCellQueryKeys = activeCellQueryKeysRef.current
    return () => {
      activeCellQueryKeys.forEach((queryKey, cellId) => {
        const scopeKey = createNotebookScopeKey(bufferId, cellId)
        questExecution.dismissPending(scopeKey)
        questExecution.releaseExecution(queryKey, scopeKey)
      })
      activeCellQueryKeys.clear()
    }
  }, [bufferId, questExecution])

  useEffect(() => {
    const controller = createNotebookController(bufferId, liveActionsRef)
    registerController(controller)
    return () => unregisterController(bufferId)
  }, [bufferId])

  return (
    <NotebookActionsContext.Provider value={actionsValue}>
      <NotebookStateContext.Provider value={stateValue}>
        {children}
      </NotebookStateContext.Provider>
    </NotebookActionsContext.Provider>
  )
}
