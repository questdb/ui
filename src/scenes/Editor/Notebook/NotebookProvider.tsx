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
  CellResult,
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
  addCellTransition,
  createNotebookController,
  deleteCellTransition,
  duplicateCellTransition,
  moveCellDownTransition,
  moveCellUpTransition,
  registerController,
  setCellMaximizedTransition,
  setCellModeTransition,
  setCellViewMaximizedTransition,
  unregisterController,
  type NotebookControllerActions,
  type NotebookTransitionResult,
  type ViewParts,
} from "../../../utils/notebooks/notebookController"
import {
  type CellRunOutcome,
  computeResultBottomHeight,
  generateId,
  releaseCellResultPatch,
} from "./notebookUtils"
import { silently } from "../../../utils/notebooks/notebookToolError"
import type { AutoRefresh } from "../../../store/notebook"
import {
  deleteCellSnapshot,
  loadCellSnapshot,
  loadSnapshotCellIds,
  pinNotebookSnapshots,
  pruneToRecentNotebooks,
} from "../../../store/notebookResults"
import { removeNotebookCellLayouts } from "./notebookColumnLayoutStore"
import type { QueryKey } from "../../../store/Query/types"
import { createValidateWithGlobals } from "./declareUtils"
import {
  ChartRefreshProvider,
  useChartRefreshEngine,
} from "./chartRefresh/ChartRefreshContext"
import {
  CellVirtualizationProvider,
  createVirtualizationEngine,
} from "./cellVirtualization/CellVirtualizationContext"
import {
  clearChartZoom,
  clearChartZooms,
} from "./cellVirtualization/chartZoomStore"
import type { CellVirtualizationEngine } from "./cellVirtualization/cellVirtualizationEngine"
import { CellResultHydrationEngine } from "./resultHydration/cellResultHydration"
import { CellResultHydrationProvider } from "./resultHydration/CellResultHydrationContext"
import { resetChartEntryAnimation } from "./CellChart/chartEntryAnimation"

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
    expectFullValue?: boolean,
  ) => Promise<CellRunOutcome>
  reRunResultAt: (cellId: string, index: number) => Promise<boolean>
  cancelCell: (cellId: string) => void
  cancelQuery: (cellId: string, index: number) => void
  setActiveResultIndex: (cellId: string, index: number) => void
  setCellMode: (cellId: string, mode: CellMode) => void
  clearCellResult: (cellId: string) => void
  mirrorCellResult: (cellId: string, result: CellResult | undefined) => void
  setCellChartConfig: (cellId: string, config: ChartConfig) => void
  setCellRefresh: (cellId: string, value: AutoRefresh) => void
  setCellViewMaximized: (cellId: string, value: boolean) => void
  setFocusedCell: (cellId: string | null) => void
  setMaximizedCellId: (cellId: string | null) => void
  getCellsSnapshot: () => NotebookCell[]
}

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
  runCell: () => Promise.resolve({ ok: false, superseded: false }),
  reRunResultAt: () => Promise.resolve(false),
  cancelCell: () => undefined,
  cancelQuery: () => undefined,
  setActiveResultIndex: () => undefined,
  setCellMode: () => undefined,
  clearCellResult: () => undefined,
  mirrorCellResult: () => undefined,
  setCellChartConfig: () => undefined,
  setCellRefresh: () => undefined,
  setCellViewMaximized: () => undefined,
  setFocusedCell: () => undefined,
  setMaximizedCellId: () => undefined,
  getCellsSnapshot: () => [],
}

const NOOP_LIVE_ACTIONS: LiveNotebookActions = {
  ...NOOP_ACTIONS,
  getSettings: () => ({}),
  getMaximizedCellId: () => null,
  applyTransition: (run) =>
    run({
      cells: [],
      settings: {},
      maximizedCellId: null,
      focusedCellId: null,
    }).result,
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
const NotebookBufferIdContext = createContext<number>(0)

export const useNotebookState = () => useContext(NotebookStateContext)
export const useNotebookActions = () => useContext(NotebookActionsContext)
export const useNotebookBufferId = () => useContext(NotebookBufferIdContext)

export const NotebookProvider: React.FC<{
  initialState: NotebookViewState
  bufferId: number
  preview?: boolean
}> = ({ initialState, bufferId, preview = false, children }) => {
  const { updateBuffer } = useEditor()
  const { quest, questExecution } = useContext(QuestContext)

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

  const { persistCells, persistImmediately, persistDebounced } =
    useNotebookPersistence({
      bufferId,
      updateBuffer,
      focusedCellIdRef,
      maximizedCellIdRef,
      settingsRef,
      preview,
    })

  const store = useCellsStore({
    initialCells: initialState.cells,
    persistCells,
  })

  const { hydrateCells, cellsRef } = store

  useEffect(() => {
    const unpin = pinNotebookSnapshots(bufferId)
    void pruneToRecentNotebooks()
    return unpin
  }, [bufferId])

  // Snapshots for cells that no longer exist (out-of-band divergence, e.g. an
  // applied external state) — index-only read, payloads untouched. Cell-delete
  // transitions clean up their own snapshots.
  useEffect(() => {
    let cancelled = false
    loadSnapshotCellIds(bufferId)
      .then((snapshotCellIds) => {
        if (cancelled) return
        const liveCellIds = new Set(cellsRef.current.map((c) => c.id))
        snapshotCellIds
          .filter((cellId) => !liveCellIds.has(cellId))
          .forEach((cellId) => void deleteCellSnapshot(bufferId, cellId))
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [bufferId, cellsRef])

  // Results hydrate per cell on scroll approach and release back to
  // IndexedDB-only when the cell leaves the retain band. The virtualization
  // engine drives both directions; the ref breaks the construction cycle.
  const virtualizationEngineRef = useRef<CellVirtualizationEngine | null>(null)
  const resultHydration = useMemo(
    () =>
      new CellResultHydrationEngine({
        loadSnapshot: (cellId) => loadCellSnapshot(bufferId, cellId),
        getCell: (cellId) => cellsRef.current.find((c) => c.id === cellId),
        applyResult: (cellId, result) => {
          hydrateCells((prev) =>
            prev.map((c) =>
              c.id === cellId && c.result == null ? { ...c, result } : c,
            ),
          )
        },
        releaseResult: (cellId) => {
          hydrateCells((prev) =>
            prev.map((c) =>
              c.id === cellId ? { ...c, ...releaseCellResultPatch(c) } : c,
            ),
          )
        },
        canRelease: (cellId) =>
          virtualizationEngineRef.current?.canReleaseData(cellId) ?? false,
      }),
    [],
  )
  useEffect(() => () => resultHydration.destroy(), [])
  useEffect(() => {
    resultHydration.sync(store.cells)
  }, [store.cells])

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
    onSnapshotPersisted: (cellId, results) =>
      resultHydration.notePersisted(cellId, results),
  })

  const setFocusedCell = useCallback(
    (cellId: string | null) => {
      if (focusedCellIdRef.current === cellId) return
      focusedCellIdRef.current = cellId
      setFocusedCellState(cellId)
      persistDebounced(store.cellsRef.current)
    },
    [persistDebounced, store.cellsRef],
  )

  const updateSettings = useCallback(
    (updates: Partial<NotebookSettings>) => {
      const next = { ...settingsRef.current, ...updates }
      settingsRef.current = next
      setSettingsState(next)
      persistImmediately(store.cellsRef.current)
    },
    [persistImmediately, store.cellsRef],
  )

  const releaseCellExecution = useCallback(
    (cellId: string) => {
      const queryKey = activeCellQueryKeysRef.current.get(cellId)
      if (queryKey) {
        activeCellQueryKeysRef.current.delete(cellId)
        questExecution.releaseExecution(
          queryKey,
          createNotebookScopeKey(bufferId, cellId),
        )
      }
    },
    [bufferId, questExecution],
  )

  const cancelCell = useCallback(
    (cellId: string) => {
      execution.cancelCell(cellId)
      releaseCellExecution(cellId)
    },
    [execution, releaseCellExecution],
  )

  const abortCellRun = useCallback(
    (cellId: string) => {
      execution.abortCellRun(cellId)
      releaseCellExecution(cellId)
    },
    [execution, releaseCellExecution],
  )

  const applyTransition = useCallback(
    <T,>(run: (parts: ViewParts) => NotebookTransitionResult<T>): T => {
      const out = run({
        cells: store.cellsRef.current,
        settings: settingsRef.current,
        maximizedCellId: maximizedCellIdRef.current,
        focusedCellId: focusedCellIdRef.current,
      })
      const { parts } = out
      // Sync refs so a second transition in the same tick composes on top of
      // this one (cells is kept current by the store's setters).
      settingsRef.current = parts.settings
      maximizedCellIdRef.current = parts.maximizedCellId
      focusedCellIdRef.current = parts.focusedCellId
      unstable_batchedUpdates(() => {
        store.hydrateCells(() => parts.cells)
        setSettingsState(parts.settings)
        setMaximizedCellIdState(parts.maximizedCellId)
        setFocusedCellState(parts.focusedCellId)
      })
      persistImmediately(parts.cells, true)
      // A deleted cell's in-flight run must be cancelled; the transition reports
      // deleted cells via cleanup, so every delete route (UI or agent) cancels
      // here rather than at each call site.
      if (out.cleanup) {
        for (const cellId of out.cleanup.cellIds) {
          cancelCell(cellId)
          void deleteCellSnapshot(bufferId, cellId)
          removeNotebookCellLayouts(bufferId, cellId)
          clearChartZoom(cellId)
        }
      }
      // For run->draw transitions, abort the in-flight run
      if (out.cancelRuns) {
        for (const cellId of out.cancelRuns.cellIds) abortCellRun(cellId)
      }
      return out.result
    },
    [store, persistImmediately, bufferId, cancelCell, abortCellRun],
  )

  const setMaximizedCellId = useCallback(
    (cellId: string | null) =>
      silently(() =>
        applyTransition((parts) =>
          setCellMaximizedTransition(parts, bufferId, cellId),
        ),
      ),
    [applyTransition, bufferId],
  )

  const addCell = useCallback(
    (afterCellId?: string, value?: string, type?: CellType): string =>
      silently(() =>
        applyTransition((parts) =>
          addCellTransition(parts, bufferId, {
            id: generateId(),
            value: value ?? "",
            afterCellId,
            type,
          }),
        ),
      ) ?? "",
    [applyTransition, bufferId],
  )

  const setCellMode = useCallback(
    (cellId: string, mode: CellMode) =>
      silently(() =>
        applyTransition((parts) =>
          setCellModeTransition(parts, bufferId, cellId, mode),
        ),
      ),
    [applyTransition, bufferId],
  )

  // Toggle the run grid off: drop the in-memory result and run-status so the
  // cell collapses back to editor-only, and delete the persisted snapshot so it
  // doesn't rehydrate on the next load.
  const clearCellResult = useCallback(
    (cellId: string) => {
      const cell = store.cellsRef.current.find((c) => c.id === cellId)
      store.updateCell(cellId, {
        result: undefined,
        lastRunStatus: undefined,
        ...(cell?.bottomResized ? {} : { bottomHeight: undefined }),
      })
      resultHydration.forget(cellId)
      void deleteCellSnapshot(bufferId, cellId)
    },
    [store, bufferId, resultHydration],
  )

  const mirrorCellResult = useCallback(
    (cellId: string, result: CellResult | undefined) => {
      hydrateCells((prev) =>
        prev.map((c) => (c.id === cellId ? { ...c, result } : c)),
      )
    },
    [hydrateCells],
  )

  const validateWithGlobals = useMemo(
    () => createValidateWithGlobals(quest, () => settingsRef.current.variables),
    [quest],
  )

  const chartRefreshEngine = useChartRefreshEngine({
    bufferId,
    cells: store.cells,
    deps: {
      executeSingle,
      validateWithGlobals,
      mirrorCellResult,
      getCellResult: (cellId) =>
        store.cellsRef.current.find((c) => c.id === cellId)?.result,
    },
  })

  const cellVirtualizationEngine = createVirtualizationEngine({
    bufferId,
    cells: store.cells,
    focusedCellId,
    maximizedCellId,
    runningCellIds: execution.runningCellIds,
    onCellDataNeeded: (cellId) => resultHydration.request(cellId),
    onCellDataReleasable: (cellId) => resultHydration.noteReleasable(cellId),
  })
  virtualizationEngineRef.current = cellVirtualizationEngine

  useEffect(
    () => () => {
      resetChartEntryAnimation(bufferId)
      clearChartZooms(cellsRef.current.map((c) => c.id))
    },
    [bufferId, cellsRef],
  )

  const runCellNow = useCallback(
    async (
      cellId: string,
      queryKey: QueryKey,
      scopeKey: string,
      sql?: string,
      signal?: AbortSignal,
      expectFullValue: boolean = false,
    ) => {
      activeCellQueryKeysRef.current.set(cellId, queryKey)

      try {
        const outcome = await execution.runCell(
          cellId,
          sql,
          signal,
          expectFullValue,
        )
        // Size the result-double-view to the result shape, unless the user
        // locked the bottom height (bottomResized).
        const cell = store.cellsRef.current.find((c) => c.id === cellId)
        if (
          cell &&
          cell.mode !== "draw" &&
          cell.type !== "markdown" &&
          !cell.bottomResized
        ) {
          store.updateCell(cellId, {
            bottomHeight: computeResultBottomHeight(cell.result),
          })
        }

        return outcome
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
    async (
      cellId: string,
      sql?: string,
      signal?: AbortSignal,
      expectFullValue: boolean = false,
    ) => {
      const runId = ++notebookRunIdRef.current
      const queryKey = createNotebookQueryKey(bufferId, cellId, runId)
      const scopeKey = createNotebookScopeKey(bufferId, cellId)

      return new Promise<CellRunOutcome>((resolve) => {
        const execute = () => {
          void runCellNow(
            cellId,
            queryKey,
            scopeKey,
            sql,
            signal,
            expectFullValue,
          ).then(resolve)
        }
        const request = () =>
          questExecution.requestExecution({
            abort: () => cancelCell(cellId),
            bufferId,
            execute,
            onDismiss: () => resolve({ ok: false, superseded: false }),
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
    // applyTransition cancels the deleted cell's in-flight run via its cleanup.
    (cellId: string) =>
      silently(() =>
        applyTransition((parts) =>
          deleteCellTransition(parts, bufferId, cellId),
        ),
      ),
    [applyTransition, bufferId],
  )

  const duplicateCell = useCallback(
    (cellId: string): string => {
      const newId =
        silently(() =>
          applyTransition((parts) =>
            duplicateCellTransition(parts, bufferId, cellId, generateId()),
          ),
        ) ?? ""
      if (newId) resultHydration.noteMissing(newId)
      return newId
    },
    [applyTransition, bufferId],
  )

  const moveCellUp = useCallback(
    (cellId: string) =>
      silently(() =>
        applyTransition((parts) =>
          moveCellUpTransition(parts, bufferId, cellId),
        ),
      ),
    [applyTransition, bufferId],
  )

  const moveCellDown = useCallback(
    (cellId: string) =>
      silently(() =>
        applyTransition((parts) =>
          moveCellDownTransition(parts, bufferId, cellId),
        ),
      ),
    [applyTransition, bufferId],
  )

  const setCellViewMaximized = useCallback(
    (cellId: string, value: boolean) =>
      silently(() =>
        applyTransition((parts) =>
          setCellViewMaximizedTransition(parts, bufferId, cellId, value),
        ),
      ),
    [applyTransition, bufferId],
  )

  liveActionsRef.current = {
    getVariables: () => settingsRef.current.variables,
    updateSettings,
    addCell,
    deleteCell,
    updateCell: store.updateCell,
    moveCellUp,
    moveCellDown,
    duplicateCell,
    runCell,
    reRunResultAt: execution.reRunResultAt,
    cancelCell,
    cancelQuery: execution.cancelQuery,
    setActiveResultIndex: execution.setActiveResultIndex,
    setCellMode,
    clearCellResult,
    mirrorCellResult,
    setCellChartConfig: store.setCellChartConfig,
    setCellRefresh: store.setCellRefresh,
    setCellViewMaximized,
    setFocusedCell,
    setMaximizedCellId,
    getCellsSnapshot: () => store.cellsRef.current.slice(),
    getSettings: () => ({ ...settingsRef.current }),
    getMaximizedCellId: () => maximizedCellIdRef.current,
    applyTransition,
  }

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
    if (preview) return
    const controller = createNotebookController(bufferId, liveActionsRef)
    registerController(controller)
    return () => unregisterController(bufferId)
  }, [bufferId, preview])

  return (
    <NotebookBufferIdContext.Provider value={bufferId}>
      <NotebookActionsContext.Provider value={actionsValue}>
        <NotebookStateContext.Provider value={stateValue}>
          <ChartRefreshProvider value={chartRefreshEngine}>
            <CellVirtualizationProvider value={cellVirtualizationEngine}>
              <CellResultHydrationProvider value={resultHydration}>
                {children}
              </CellResultHydrationProvider>
            </CellVirtualizationProvider>
          </ChartRefreshProvider>
        </NotebookStateContext.Provider>
      </NotebookActionsContext.Provider>
    </NotebookBufferIdContext.Provider>
  )
}
