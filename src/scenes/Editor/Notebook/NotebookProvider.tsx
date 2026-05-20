import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { unstable_batchedUpdates } from "react-dom"
import { useEditor } from "../../../providers/EditorProvider"
import type {
  CellLayoutItem,
  NotebookCell,
  NotebookVariable,
  NotebookViewState,
  NotebookSettings,
  CellMode,
} from "../../../store/notebook"
import type { ChartConfig } from "./CellChart/chartTypes"
import { useQueryExecution } from "../../../hooks/useQueryExecution"
import { useCellsStore } from "./useCellsStore"
import { useCellExecution } from "./useCellExecution"
import { useNotebookPersistence } from "./useNotebookPersistence"
import {
  registerController,
  unregisterController,
  type ApplyNotebookStateRequest,
  type NotebookController,
} from "../../../utils/notebookAIBridge"
import { sanitizeForPromptContext } from "../../../utils/ai/notebookSnapshot"
import {
  buildAppliedCells,
  buildAppliedLayout,
  computeResultBottomHeight,
  DEFAULT_CHART_BOTTOM_HEIGHT,
} from "./notebookUtils"

// State and actions live in SEPARATE contexts: action-only consumers never
// re-render when state changes (the actions value is ref-stable for life).

export type NotebookState = {
  cells: NotebookCell[]
  settings: NotebookSettings
  focusedCellId: string | null
  maximizedCellId: string | null
  runningCellIds: Set<string>
}

export type NotebookActions = {
  getVariables: () => NotebookVariable[] | undefined
  updateSettings: (updates: Partial<NotebookSettings>) => void
  addCell: (afterCellId?: string, value?: string) => string
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
  runCellScript: (cellId: string, queries: string[]) => Promise<void>
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
}

export type NotebookContextType = NotebookState & NotebookActions

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
  runCellScript: () => Promise.resolve(),
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
}

const EMPTY_STATE: NotebookState = {
  cells: [],
  settings: {},
  focusedCellId: null,
  maximizedCellId: null,
  runningCellIds: new Set(),
}

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

  const [focusedCellId, setFocusedCellState] = useState<string | null>(
    initialState.focusedCellId ?? null,
  )
  const [maximizedCellId, setMaximizedCellIdState] = useState<string | null>(
    initialState.maximizedCellId ?? null,
  )
  const [settings, setSettingsState] = useState<NotebookSettings>(
    initialState.settings ?? {},
  )

  const { executeSingle } = useQueryExecution(settings.variables)

  const focusedCellIdRef = useRef(focusedCellId)
  const maximizedCellIdRef = useRef(maximizedCellId)
  const settingsRef = useRef(settings)

  // Forward ref breaks the circular dep between useCellsStore (needs
  // persistCells) and useNotebookPersistence (needs cellsRef).
  const cellsRefForPersist = useRef<NotebookCell[]>(initialState.cells)

  const { persistCells, persistImmediately } = useNotebookPersistence({
    bufferId,
    updateBuffer,
    cellsRef: cellsRefForPersist,
    focusedCellIdRef,
    maximizedCellIdRef,
    settingsRef,
  })

  const store = useCellsStore({
    initialCells: initialState.cells,
    persistCells,
  })

  cellsRefForPersist.current = store.cellsRef.current

  const execution = useCellExecution({
    cellsRef: store.cellsRef,
    executeSingle,
    updateCellResult: store.updateCellResult,
    updateCell: store.updateCell,
    updateCells: store.updateCells,
    markCancelledAll: store.markCancelledAll,
    markCancelledOne: store.markCancelledOne,
    setScriptSummary: store.setScriptSummary,
  })

  // Refs let the AI-bridge controller effect depend on [bufferId] alone —
  // store/execution return fresh literals each render, which would otherwise
  // cycle register/unregister and race waitForController waiters.
  const storeRef = useRef(store)
  storeRef.current = store
  const executionRef = useRef(execution)
  executionRef.current = execution

  const setFocusedCell = useCallback((cellId: string | null) => {
    focusedCellIdRef.current = cellId
    setFocusedCellState(cellId)
  }, [])

  const updateSettings = useCallback(
    (updates: Partial<NotebookSettings>) => {
      const next = { ...settingsRef.current, ...updates }
      settingsRef.current = next
      setSettingsState(next)
      persistImmediately()
    },
    [persistImmediately],
  )

  const setMaximizedCellId = useCallback(
    (cellId: string | null) => {
      maximizedCellIdRef.current = cellId
      setMaximizedCellIdState(cellId)
      persistImmediately()
    },
    [persistImmediately],
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
      persistImmediately()
    },
    [persistImmediately],
  )

  // In grid mode, freshly added cells must land in `settings.layout` so
  // mergeCellLayout has a real position entry to read. The `h` value
  // written here is a placeholder — the actual rendered grid h is derived
  // at render time from cell.topHeight + cell.bottomHeight (see
  // computeCellGridH).
  const addCell = useCallback(
    (afterCellId?: string, value?: string): string => {
      let newId = ""
      unstable_batchedUpdates(() => {
        newId = store.addCell(afterCellId, value)
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

  const runCell = useCallback(
    async (cellId: string, sql?: string, signal?: AbortSignal) => {
      const ok = await execution.runCell(cellId, sql, signal)
      // Every run (success OR error) puts the cell into result-double-view.
      // Height is conditioned on the actual result shape so DDL/DML/empty-
      // DQL/error results don't reserve 10 blank rows of space. Per rule
      // 6.c, any prior user drag of the bottom handle is discarded on
      // re-run.
      const cell = store.cellsRef.current.find((c) => c.id === cellId)
      if (cell && cell.mode !== "draw") {
        store.updateCell(cellId, {
          bottomHeight: computeResultBottomHeight(cell.result),
        })
      }
      return ok
    },
    [execution, store],
  )

  const runCellScript = useCallback(
    async (cellId: string, queries: string[]) => {
      await execution.runCellScript(cellId, queries)
      const cell = store.cellsRef.current.find((c) => c.id === cellId)
      if (cell && cell.mode !== "draw") {
        store.updateCell(cellId, {
          bottomHeight: computeResultBottomHeight(cell.result),
        })
      }
    },
    [execution, store],
  )

  const deleteCell = useCallback(
    (cellId: string) => {
      store.removeCellById(cellId)
      if (focusedCellIdRef.current === cellId) {
        setFocusedCell(null)
      }
      if (maximizedCellIdRef.current === cellId) {
        setMaximizedCellId(null)
      }
    },
    [store, setMaximizedCellId],
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

  const stateValue = useMemo<NotebookState>(
    () => ({
      cells: store.cells,
      settings,
      focusedCellId,
      maximizedCellId,
      runningCellIds: execution.runningCellIds,
    }),
    [
      store.cells,
      settings,
      focusedCellId,
      maximizedCellId,
      execution.runningCellIds,
    ],
  )

  // Indirect through a ref so the action object identity never changes —
  // consumers don't re-render when the underlying callbacks are recreated.
  const liveActionsRef = useRef<NotebookActions>(NOOP_ACTIONS)
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
    runCellScript,
    cancelCell: execution.cancelCell,
    cancelQuery: execution.cancelQuery,
    setActiveResultIndex: execution.setActiveResultIndex,
    setCellMode,
    setCellChartConfig: store.setCellChartConfig,
    setCellAutoRefresh: store.setCellAutoRefresh,
    setCellChartMaximized: store.setCellChartMaximized,
    setCellLayout,
    setFocusedCell,
    setMaximizedCellId,
  }

  const actionsValue = useMemo<NotebookActions>(
    () => ({
      getVariables: () => liveActionsRef.current.getVariables(),
      updateSettings: (...args) =>
        liveActionsRef.current.updateSettings(...args),
      addCell: (...args) => liveActionsRef.current.addCell(...args),
      deleteCell: (...args) => liveActionsRef.current.deleteCell(...args),
      updateCell: (...args) => liveActionsRef.current.updateCell(...args),
      moveCellUp: (...args) => liveActionsRef.current.moveCellUp(...args),
      moveCellDown: (...args) => liveActionsRef.current.moveCellDown(...args),
      duplicateCell: (...args) => liveActionsRef.current.duplicateCell(...args),
      runCell: (...args) => liveActionsRef.current.runCell(...args),
      runCellScript: (...args) => liveActionsRef.current.runCellScript(...args),
      cancelCell: (...args) => liveActionsRef.current.cancelCell(...args),
      cancelQuery: (...args) => liveActionsRef.current.cancelQuery(...args),
      setActiveResultIndex: (...args) =>
        liveActionsRef.current.setActiveResultIndex(...args),
      setCellMode: (...args) => liveActionsRef.current.setCellMode(...args),
      setCellChartConfig: (...args) =>
        liveActionsRef.current.setCellChartConfig(...args),
      setCellAutoRefresh: (...args) =>
        liveActionsRef.current.setCellAutoRefresh(...args),
      setCellChartMaximized: (...args) =>
        liveActionsRef.current.setCellChartMaximized(...args),
      setCellLayout: (...args) => liveActionsRef.current.setCellLayout(...args),
      setFocusedCell: (...args) =>
        liveActionsRef.current.setFocusedCell(...args),
      setMaximizedCellId: (...args) =>
        liveActionsRef.current.setMaximizedCellId(...args),
    }),
    [],
  )

  useEffect(() => {
    const controller: NotebookController = {
      bufferId,
      addCell: (valueArg, afterCellId) =>
        liveActionsRef.current.addCell(afterCellId, valueArg),
      updateCell: (cellId, updates) =>
        storeRef.current.updateCell(cellId, updates),
      deleteCell: (cellId) => liveActionsRef.current.deleteCell(cellId),
      moveCellUp: (cellId) => storeRef.current.moveCellUp(cellId),
      moveCellDown: (cellId) => storeRef.current.moveCellDown(cellId),
      duplicateCell: (cellId) => liveActionsRef.current.duplicateCell(cellId),
      runCell: async (cellId, signal) => {
        const ok = await liveActionsRef.current.runCell(
          cellId,
          undefined,
          signal,
        )
        if (ok) return { success: true }
        const cell = storeRef.current.cellsRef.current.find(
          (c) => c.id === cellId,
        )
        if (!cell || !cell.result) {
          return { success: false }
        }
        const errorResult = cell.result.results.find((r) => r.type === "error")
        const rawError =
          errorResult && errorResult.type === "error"
            ? errorResult.error
            : cell.result.error
        const trimmed = rawError
          ? rawError.length > 200
            ? `${rawError.slice(0, 197)}...`
            : rawError
          : undefined
        return {
          // sanitize to neutralize </notebook_context>-style smuggling.
          success: false,
          error: trimmed ? sanitizeForPromptContext(trimmed) : undefined,
        }
      },
      setLayoutMode: (mode) =>
        liveActionsRef.current.updateSettings({ layoutMode: mode }),
      setVariables: (variables) =>
        liveActionsRef.current.updateSettings({ variables }),
      setCellLayout: (cellId, pos) =>
        liveActionsRef.current.setCellLayout(cellId, pos),
      setCellMode: (cellId, mode) => {
        liveActionsRef.current.setCellMode(cellId, mode)
        // Match Cell.tsx user-click — entering Draw auto-maximizes.
        if (mode === "draw") {
          storeRef.current.setCellChartMaximized(cellId, true)
        }
      },
      setCellChartConfig: (cellId, cfg) =>
        storeRef.current.setCellChartConfig(cellId, cfg),
      setCellAutoRefresh: (cellId, value) =>
        storeRef.current.setCellAutoRefresh(cellId, value),
      setCellChartMaximized: (cellId, value) =>
        storeRef.current.setCellChartMaximized(cellId, value),
      setCellMaximized: (cellId) =>
        liveActionsRef.current.setMaximizedCellId(cellId),
      applyNotebookState: (request: ApplyNotebookStateRequest) => {
        // All-or-nothing: buildAppliedCells throws before any mutation.
        const prev = storeRef.current.cellsRef.current
        const { nextCells, diff } = buildAppliedCells(prev, request)
        const targetLayoutMode =
          request.layoutMode === undefined || request.layoutMode === null
            ? settingsRef.current.layoutMode
            : request.layoutMode
        storeRef.current.updateCells(() => nextCells)
        if (targetLayoutMode === "grid") {
          const nextLayout = buildAppliedLayout(
            request,
            nextCells,
            settingsRef.current.layout,
            { gridCols: 12, rowHeight: 10, marginY: 20 },
          )
          liveActionsRef.current.updateSettings({
            layoutMode: "grid",
            layout: nextLayout,
          })
        } else if (
          request.layoutMode !== undefined &&
          request.layoutMode !== null
        ) {
          liveActionsRef.current.updateSettings({
            layoutMode: request.layoutMode,
          })
        }
        if (request.maximizedCellId !== undefined) {
          liveActionsRef.current.setMaximizedCellId(
            request.maximizedCellId ?? null,
          )
        } else if (
          maximizedCellIdRef.current &&
          !nextCells.some((c) => c.id === maximizedCellIdRef.current)
        ) {
          liveActionsRef.current.setMaximizedCellId(null)
        }
        if (request.variables !== undefined) {
          liveActionsRef.current.updateSettings({
            variables: request.variables ?? [],
          })
        }
        return { applied: diff }
      },
      getCellsSnapshot: () => storeRef.current.cellsRef.current.slice(),
      getSettings: () => ({ ...settingsRef.current }),
      getMaximizedCellId: () => maximizedCellIdRef.current,
    }
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
