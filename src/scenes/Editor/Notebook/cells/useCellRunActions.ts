import { useCallback, useEffect, useRef } from "react"
import type { editor } from "monaco-editor"
import type { NotebookCell } from "../../../../store/notebook"
import { useNotebookActions, useNotebookBufferId } from "../NotebookProvider"
import { useValidateWithGlobals } from "../globals/useValidateWithGlobals"
import { getQueryFromCursor, normalizeQueryText } from "../../Monaco/utils"
import { resolveRunAction } from "../notebookUtils"
import {
  emitUserAction,
  signalUserEdit,
} from "../../../../utils/notebooks/notebookAIBridge"
import { createRunStatus, type RanStatus } from "../../../../utils/ai/runStatus"
import { requireAllDQL } from "../../../../utils/tools/permissions"
import { toast } from "../../../../components/Toast"
import { eventBus } from "../../../../modules/EventBus"
import { EventType } from "../../../../modules/EventBus/types"

type Options = {
  cell: NotebookCell
  isRunning: boolean
  isCompactTier: boolean
  showBottomSlot: boolean
  editorRef: React.MutableRefObject<editor.IStandaloneCodeEditor | null>
  applyHighlight: (ok: boolean) => void
  clearHighlight: () => void
}

// Run / draw orchestration for a cell: resolves what a Run gesture means for
// the current mode and view, runs it, and emits the agent-facing events. The
// toolbar buttons, Monaco commands, keyboard shortcuts, and the RUN/DRAW
// eventBus messages all route through here.
export const useCellRunActions = ({
  cell,
  isRunning,
  isCompactTier,
  showBottomSlot,
  editorRef,
  applyHighlight,
  clearHighlight,
}: Options) => {
  const {
    runCell,
    setCellMode,
    clearCellResult,
    setCellViewMaximized,
    getCellsSnapshot,
  } = useNotebookActions()
  const bufferIdForEvents = useNotebookBufferId()
  const validateWithGlobals = useValidateWithGlobals()
  const isDrawMode = cell.mode === "draw"

  // A run from the Run toggle spins the Run segment; a run from the refresh
  // button spins the refresh button instead.
  const firstRunRef = useRef(false)
  const validatingDrawRef = useRef(false)

  // Returns true only when the cell actually entered draw mode, so a caller can
  // apply chart-only follow-ups (e.g. maximize) without affecting a cell whose
  // draw was refused by validation.
  const handleDrawClick = useCallback(async (): Promise<boolean> => {
    if (isRunning) return false
    if (isDrawMode) {
      setCellMode(cell.id, "run")
      clearCellResult(cell.id)
      emitUserAction({
        kind: "user_changed_cell_mode",
        bufferId: bufferIdForEvents,
        cellId: cell.id,
        mode: "run",
      })
      return false
    }
    if (validatingDrawRef.current) return false
    validatingDrawRef.current = true
    try {
      const decision = await requireAllDQL(cell.value, (s) =>
        validateWithGlobals(s),
      )
      if (!decision.granted) {
        toast.error(decision.reason)
        return false
      }
      setCellMode(cell.id, "draw")
      emitUserAction({
        kind: "user_changed_cell_mode",
        bufferId: bufferIdForEvents,
        cellId: cell.id,
        mode: "draw",
      })
      return true
    } finally {
      validatingDrawRef.current = false
    }
  }, [
    cell.id,
    cell.value,
    isRunning,
    isDrawMode,
    setCellMode,
    clearCellResult,
    bufferIdForEvents,
    validateWithGlobals,
  ])

  const tryRunSelection = useCallback(async (): Promise<boolean> => {
    const ed = editorRef.current
    if (!ed) return false
    const selection = ed.getSelection()
    const model = ed.getModel()
    if (!selection || !model || selection.isEmpty()) return false

    const selectedText = model.getValueInRange(selection)
    const normalized = normalizeQueryText(selectedText)
    if (!normalized) return false

    clearHighlight()
    const { ok } = await runCell(cell.id, normalized)
    applyHighlight(ok)
    return true
  }, [cell.id, runCell, editorRef, applyHighlight, clearHighlight])

  const emitRanEvent = useCallback(
    (status: RanStatus) => {
      emitUserAction({
        kind: "user_ran_cell",
        bufferId: bufferIdForEvents,
        cellId: cell.id,
        status,
      })
    },
    [bufferIdForEvents, cell.id],
  )

  const handleRunAll = useCallback(
    async (ignoreSelection = false) => {
      if (editorRef.current) {
        if (!ignoreSelection && (await tryRunSelection())) return
        clearHighlight()
      }

      const priorResult =
        getCellsSnapshot().find((c) => c.id === cell.id)?.result ?? null
      const { ok } = await runCell(cell.id)
      const freshResult =
        getCellsSnapshot().find((c) => c.id === cell.id)?.result ?? null
      emitRanEvent(createRunStatus(priorResult, freshResult, ok))
    },
    [
      cell.id,
      runCell,
      tryRunSelection,
      editorRef,
      clearHighlight,
      emitRanEvent,
      getCellsSnapshot,
    ],
  )

  const handleRunSingle = useCallback(async () => {
    const ed = editorRef.current
    // Capture the cursor's statement before any await — a reveal in this same
    // gesture can unmount the editor, and reading it afterwards loses it.
    const cursorQuery = ed ? getQueryFromCursor(ed)?.query : undefined
    if (ed && (await tryRunSelection())) return
    // Cursor first; otherwise reuse the active result tab's query so a single
    // run never silently expands into running every statement.
    const activeQuery =
      cell.result?.results[cell.result.activeResultIndex]?.query
    const sql = cursorQuery ?? activeQuery
    if (!sql?.trim()) {
      await handleRunAll()
      return
    }
    clearHighlight()
    const priorResult =
      getCellsSnapshot().find((c) => c.id === cell.id)?.result ?? null
    const { ok } = await runCell(cell.id, normalizeQueryText(sql))
    const freshResult =
      getCellsSnapshot().find((c) => c.id === cell.id)?.result ?? null
    emitRanEvent(createRunStatus(priorResult, freshResult, ok))
  }, [
    cell.id,
    cell.result,
    runCell,
    tryRunSelection,
    editorRef,
    clearHighlight,
    handleRunAll,
    emitRanEvent,
    getCellsSnapshot,
  ])

  const runResolved = useCallback(
    (intent: "all" | "single", ignoreSelection = false) => {
      const plan = resolveRunAction(
        { mode: cell.mode, result: cell.result },
        { isCompactTier, showBottomSlot, intent },
      )
      if (plan.kind === "noop") return
      if (plan.kind === "chart") {
        firstRunRef.current = false
        eventBus.publish(EventType.NOTEBOOK_CELL_REFRESH_CHART, {
          cellId: cell.id,
        })
        return
      }
      if (plan.exitDraw) {
        signalUserEdit(bufferIdForEvents)
        setCellMode(cell.id, "run")
      }
      firstRunRef.current = cell.result == null
      // Start the run before revealing: under React 17 a reveal fired from a
      // native key event re-renders synchronously and unmounts the editor, so
      // the run must read the cursor first.
      if (plan.kind === "run-all") void handleRunAll(ignoreSelection)
      else void handleRunSingle()
      if (plan.reveal) setCellViewMaximized(cell.id, true)
    },
    [
      cell.id,
      cell.mode,
      cell.result,
      bufferIdForEvents,
      isCompactTier,
      showBottomSlot,
      setCellViewMaximized,
      setCellMode,
      handleRunAll,
      handleRunSingle,
    ],
  )
  const runAll = useCallback(() => runResolved("all"), [runResolved])
  const runSingle = useCallback(() => runResolved("single"), [runResolved])
  // Refresh re-runs the whole cell to reproduce its grid — never a stray
  // editor selection.
  const refreshRun = useCallback(() => runResolved("all", true), [runResolved])

  useEffect(() => {
    if (!isRunning) firstRunRef.current = false
  }, [isRunning])

  // The toolbar's "View table" / "Refresh now" (grid) drive a run, and
  // "View chart" enters draw mode — both routed here so they reuse the same
  // run / validated-draw logic as the Run / Draw toggle buttons.
  useEffect(() => {
    const runHandler = (payload?: { cellId?: string }) => {
      if (payload?.cellId !== cell.id) return
      refreshRun()
    }
    const drawHandler = (payload?: { cellId?: string; maximize?: boolean }) => {
      if (payload?.cellId !== cell.id) return
      void handleDrawClick().then((entered) => {
        if (entered && payload.maximize) setCellViewMaximized(cell.id, true)
      })
    }
    eventBus.subscribe(EventType.NOTEBOOK_CELL_RUN, runHandler)
    eventBus.subscribe(EventType.NOTEBOOK_CELL_DRAW, drawHandler)
    return () => {
      eventBus.unsubscribe(EventType.NOTEBOOK_CELL_RUN, runHandler)
      eventBus.unsubscribe(EventType.NOTEBOOK_CELL_DRAW, drawHandler)
    }
  }, [cell.id, refreshRun, handleDrawClick, setCellViewMaximized])

  const isGridLoading = isRunning && firstRunRef.current

  return { runAll, runSingle, handleDrawClick, isGridLoading }
}
