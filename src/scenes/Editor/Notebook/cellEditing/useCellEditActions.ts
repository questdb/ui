import { useCallback } from "react"
import { MAX_NOTEBOOK_CELLS } from "../../../../store/notebook"
import { toast } from "../../../../components/Toast"
import { useNotebookTelemetry } from "../useNotebookTelemetry"
import { ConsoleEvent } from "../../../../modules/ConsoleEventTracker/events"
import {
  emitUserAction,
  signalUserEdit,
} from "../../../../utils/notebooks/notebookAIBridge"
import { useNotebookActions, useNotebookBufferId } from "../NotebookProvider"
import {
  buildCellClipboardPayload,
  CELL_CLIPBOARD_MIME,
  cellClipboardPlainText,
  serializeCellClipboardPayload,
  shouldRunAfterPaste,
  type CellClipboardPayload,
} from "./cellClipboardPayload"
import { CELL_SHORTCUT_LABELS, type CellActionShortcut } from "./cellShortcut"
import { setCopiedCells } from "./copiedCellsStore"
import { showUndoToast } from "./undoToast"
import { peekUndoEntry } from "../undo/notebookUndoHistory"
import { neighbourOfRemovedCells, resolveCellView } from "../notebookUtils"
import type { Arrangement } from "../undo/cellArrangement"
import { writeClipboardData } from "./systemClipboard"
import { findMissingVariables } from "./missingVariables"

export type CellEditMethod = "shortcut" | "menu" | "button" | "toast"

const PASTE_HINT = `${CELL_SHORTCUT_LABELS.paste} to paste.`

// Confirmations and warnings close sooner than the default. The cut and
// delete toasts keep the default, to leave time for their Undo button.
const BRIEF_TOAST_MS = 2000

// One warning at a time, however often the user presses the key.
const warnCannotStep = (direction: "undo" | "redo") =>
  toast.warning(`Cannot ${direction} this change.`, {
    toastId: "notebook-history-stale",
    autoClose: BRIEF_TOAST_MS,
  })

const cellWrapperOf = (cellId: string) =>
  document.querySelector<HTMLElement>(
    `[data-notebook-cell][data-cell-id="${CSS.escape(cellId)}"]`,
  )

export const useCellEditActions = () => {
  const {
    getCellsSnapshot,
    getSettings,
    deleteCell: removeFromNotebook,
    duplicateCell: duplicateInNotebook,
    pasteCells: pasteCellsAt,
    undo: undoInNotebook,
    redo: redoInNotebook,
    runCell,
    setFocusedCell,
  } = useNotebookActions()
  const bufferId = useNotebookBufferId()
  const trackEvent = useNotebookTelemetry()

  // DOM focus keeps the shortcuts in the notebook: a menu action leaves it on
  // the page body, and a removed cell takes it with it. A cell that moved is
  // also scrolled into view. A cell that is not on screen, e.g. behind a
  // maximized one, is not selected: the shortcuts would act on it unseen.
  const selectCell = useCallback(
    (cellId: string, reveal: boolean = false) => {
      requestAnimationFrame(() => {
        const wrapper = cellWrapperOf(cellId)
        if (!wrapper) return
        setFocusedCell(cellId)
        wrapper.focus({ preventScroll: true })
        if (reveal) wrapper.scrollIntoView({ block: "nearest" })
      })
    },
    [setFocusedCell],
  )

  const announceRemoved = useCallback(
    (cellIds: string[], neighbourId: string | undefined) => {
      cellIds.forEach((cellId) =>
        emitUserAction({ kind: "user_deleted_cell", bufferId, cellId }),
      )
      if (neighbourId) selectCell(neighbourId)
    },
    [bufferId, selectCell],
  )

  const announceInserted = useCallback(
    (cellIds: string[]) => {
      cellIds.forEach((cellId) =>
        emitUserAction({ kind: "user_added_cell", bufferId, cellId }),
      )
      selectCell(cellIds[cellIds.length - 1])
    },
    [bufferId, selectCell],
  )

  const announceArranged = useCallback(
    (cellIds: string[], arrangement: Arrangement) => {
      if (arrangement.order) {
        cellIds.forEach((cellId) =>
          emitUserAction({ kind: "user_moved_cell", bufferId, cellId }),
        )
      }
      if (arrangement.layout) {
        emitUserAction({ kind: "user_changed_grid_layout", bufferId })
      }
      if (arrangement.sizes) signalUserEdit(bufferId)
      selectCell(cellIds[0], true)
    },
    [bufferId, selectCell],
  )

  const stepHistory = useCallback(
    (direction: "undo" | "redo", method: CellEditMethod) => {
      const step = direction === "undo" ? undoInNotebook() : redoInNotebook()
      if (step.kind === "empty") return
      if (step.kind === "stale") {
        warnCannotStep(direction)
        return
      }
      void trackEvent(
        direction === "undo"
          ? ConsoleEvent.NOTEBOOK_UNDO
          : ConsoleEvent.NOTEBOOK_REDO,
        { change: step.kind, method },
      )
      if (step.kind === "inserted") announceInserted(step.cellIds)
      else if (step.kind === "removed") {
        announceRemoved(step.cellIds, step.neighbourId)
      } else announceArranged(step.cellIds, step.arrangement)
    },
    [
      trackEvent,
      undoInNotebook,
      redoInNotebook,
      announceInserted,
      announceRemoved,
      announceArranged,
    ],
  )

  const undo = useCallback(
    (method: CellEditMethod) => stepHistory("undo", method),
    [stepHistory],
  )

  const redo = useCallback(
    (method: CellEditMethod) => stepHistory("redo", method),
    [stepHistory],
  )

  // The toast undoes its own change only, never a later one. When its change
  // is no longer the last one, the click says so instead of doing nothing.
  const offerUndo = useCallback(
    (message: string) => {
      const entry = peekUndoEntry(bufferId)
      showUndoToast(bufferId, message, () => {
        if (peekUndoEntry(bufferId) === entry) undo("toast")
        else warnCannotStep("undo")
      })
    },
    [bufferId, undo],
  )

  // The cell that takes the removed cell's place becomes the selected one.
  // A notebook keeps its only cell, so that removal returns false.
  const removeCell = useCallback(
    (cellId: string): boolean => {
      const cells = getCellsSnapshot()
      if (cells.length <= 1) return false
      const neighbourId = neighbourOfRemovedCells(cells, [cellId])
      removeFromNotebook(cellId)
      announceRemoved([cellId], neighbourId)
      return true
    },
    [getCellsSnapshot, removeFromNotebook, announceRemoved],
  )

  const putOnClipboard = useCallback(
    (cellId: string): CellClipboardPayload | null => {
      const cell = getCellsSnapshot().find((c) => c.id === cellId)
      if (!cell) return null
      const payload = buildCellClipboardPayload([cell], getSettings())
      setCopiedCells(payload)
      writeClipboardData({
        [CELL_CLIPBOARD_MIME]: serializeCellClipboardPayload(payload),
        "text/plain": cellClipboardPlainText(payload),
      })
      return payload
    },
    [getCellsSnapshot, getSettings],
  )

  const copyCell = useCallback(
    (cellId: string, method: CellEditMethod) => {
      const payload = putOnClipboard(cellId)
      if (!payload) return
      void trackEvent(ConsoleEvent.NOTEBOOK_CELL_COPY, {
        cellId,
        cellType: payload.cells[0].cell.type ?? "sql",
        method,
      })
      toast.success(`Cell copied. ${PASTE_HINT}`, {
        toastId: "notebook-cell-copied",
        autoClose: BRIEF_TOAST_MS,
      })
    },
    [putOnClipboard, trackEvent],
  )

  const cutCell = useCallback(
    (cellId: string, method: CellEditMethod) => {
      const payload = putOnClipboard(cellId)
      if (!payload) return
      if (!removeCell(cellId)) {
        toast.warning(
          "Cannot remove the only cell. The cell is copied to clipboard.",
          { toastId: "notebook-cell-cut-blocked", autoClose: BRIEF_TOAST_MS },
        )
        return
      }
      void trackEvent(ConsoleEvent.NOTEBOOK_CELL_CUT, {
        cellId,
        cellType: payload.cells[0].cell.type ?? "sql",
        method,
      })
      offerUndo(`Cell cut. ${PASTE_HINT}`)
    },
    [putOnClipboard, removeCell, offerUndo, trackEvent],
  )

  const warnCellLimit = useCallback(() => {
    void trackEvent(ConsoleEvent.NOTEBOOK_CELL_LIMIT_REACHED)
    toast.warning(`Notebook limit of ${MAX_NOTEBOOK_CELLS} cells reached`, {
      autoClose: BRIEF_TOAST_MS,
    })
  }, [trackEvent])

  // The copy lands right below the original and becomes the selected cell.
  const duplicateCell = useCallback(
    async (cellId: string, method: CellEditMethod) => {
      const cells = getCellsSnapshot()
      const cell = cells.find((c) => c.id === cellId)
      if (!cell) return
      if (cells.length >= MAX_NOTEBOOK_CELLS) {
        warnCellLimit()
        return
      }
      const newCellId = await duplicateInNotebook(cellId)
      void trackEvent(ConsoleEvent.NOTEBOOK_CELL_DUPLICATE, {
        cellId,
        cellType: cell.type ?? "sql",
        view: resolveCellView(cell),
        newCellId,
        outcome: newCellId ? "success" : "not_created",
        method,
      })
      if (!newCellId) return
      emitUserAction({
        kind: "user_duplicated_cell",
        bufferId,
        cellId,
        newCellId,
      })
      selectCell(newCellId)
    },
    [
      getCellsSnapshot,
      duplicateInNotebook,
      bufferId,
      selectCell,
      warnCellLimit,
      trackEvent,
    ],
  )

  const deleteCell = useCallback(
    (cellId: string, method: CellEditMethod) => {
      const cell = getCellsSnapshot().find((c) => c.id === cellId)
      if (!cell) return
      if (!removeCell(cellId)) {
        toast.warning("Cannot remove the only cell.", {
          toastId: "notebook-cell-delete-blocked",
          autoClose: BRIEF_TOAST_MS,
        })
        return
      }
      void trackEvent(ConsoleEvent.NOTEBOOK_CELL_DELETE, {
        cellId,
        cellType: cell.type ?? "sql",
        method,
      })
      offerUndo("Cell deleted.")
    },
    [getCellsSnapshot, removeCell, offerUndo, trackEvent],
  )

  // The auto-run gate never executes DDL/DML; those cells wait for the user.
  const fetchPastedCell = useCallback(
    (cellId: string) =>
      void runCell(cellId, undefined, undefined, false, {
        kind: "autoRun",
        initiator: "user",
      }).then((outcome) => {
        if (outcome.skipped !== undefined) {
          toast.info(
            "The pasted cell has DDL/DML statements, so it was not run.",
            {
              toastId: "notebook-cell-paste-skipped",
              autoClose: BRIEF_TOAST_MS,
            },
          )
        } else if (outcome.denied !== undefined) {
          toast.warning(
            "The pasted cell could not be checked, so it was not run.",
            {
              toastId: "notebook-cell-paste-denied",
              autoClose: BRIEF_TOAST_MS,
            },
          )
        }
      }),
    [runCell],
  )

  const pasteCells = useCallback(
    (
      payload: CellClipboardPayload,
      afterCellId: string | undefined,
      method: CellEditMethod,
    ) => {
      if (
        getCellsSnapshot().length + payload.cells.length >
        MAX_NOTEBOOK_CELLS
      ) {
        warnCellLimit()
        return
      }
      const availableNames = (getSettings().variables ?? []).map(
        ({ name }) => name,
      )
      const missing = new Set<string>()
      const missingByCell = payload.cells.map(({ cell }) => {
        const names =
          cell.type === "markdown"
            ? []
            : findMissingVariables(cell.value, availableNames)
        names.forEach((name) => missing.add(name))
        return names.length > 0
      })
      // Draw cells start on mount, independent of the explicit paste auto-run.
      // Keep the config, but show the SQL editor if a chart cannot run yet.
      const cells = payload.cells.map((item, index) =>
        missingByCell[index] && item.cell.mode === "draw"
          ? {
              ...item,
              cell: {
                ...item.cell,
                mode: undefined,
                paneView: "editor_result" as const,
              },
            }
          : item,
      )
      const pastedIds = pasteCellsAt(afterCellId, cells)
      if (pastedIds.length === 0) return
      void trackEvent(ConsoleEvent.NOTEBOOK_CELL_PASTE, {
        count: pastedIds.length,
        method,
      })
      announceInserted(pastedIds)
      pastedIds.forEach((cellId, index) => {
        if (!missingByCell[index] && shouldRunAfterPaste(cells[index].cell)) {
          fetchPastedCell(cellId)
        }
      })
      if (missing.size > 0) {
        const names = [...missing].map((name) => `@${name}`).join(", ")
        toast.warning(
          `Pasted cells use variables this notebook does not declare: ${names}. Cells with missing variables were not run.`,
          { toastId: "notebook-cell-paste-missing-variables" },
        )
      }
    },
    [
      getCellsSnapshot,
      getSettings,
      pasteCellsAt,
      announceInserted,
      fetchPastedCell,
      trackEvent,
      warnCellLimit,
    ],
  )

  // A shortcut on one cell, from the notebook or from the cell's open menu.
  const runCellShortcut = useCallback(
    (shortcut: CellActionShortcut, cellId: string) => {
      const actOnCell = {
        copy: copyCell,
        cut: cutCell,
        duplicate: duplicateCell,
        delete: deleteCell,
      }
      void actOnCell[shortcut](cellId, "shortcut")
    },
    [copyCell, cutCell, duplicateCell, deleteCell],
  )

  return {
    copyCell,
    cutCell,
    duplicateCell,
    deleteCell,
    pasteCells,
    undo,
    redo,
    runCellShortcut,
  }
}
