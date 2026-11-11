import { useCallback, useEffect, useRef } from "react"
import {
  CELL_CLIPBOARD_MIME,
  parseCellClipboardPayload,
} from "./cellClipboardPayload"
import {
  cellShortcutOf,
  hasOpenModalIn,
  isCellShortcutHandledElsewhere,
  type CellShortcut,
} from "./cellShortcut"
import { isPasteSink, redirectNextPaste } from "./systemClipboard"
import { useCellEditActions } from "./useCellEditActions"

const NOTEBOOK_ROOT_SELECTOR = "[data-notebook-root]"

// While a cell's settings drawer is open, the keys that act on that cell stop,
// wherever focus is: a delete would remove the cell under the drawer and drop
// its unsaved settings. Undo and redo can reach any cell, so any drawer in
// the notebook stops them.
const isBlockedByDrawer = (
  shortcut: CellShortcut,
  focusedCellId: string | null,
): boolean =>
  shortcut === "undo" || shortcut === "redo"
    ? hasOpenModalIn(document.querySelector(NOTEBOOK_ROOT_SELECTOR))
    : focusedCellId !== null &&
      hasOpenModalIn(
        document.querySelector(
          `[data-notebook-cell][data-cell-id="${CSS.escape(focusedCellId)}"]`,
        ),
      )

// The focused cell id outlives clicks outside the notebook, so the shortcuts
// also require the last pointer or focus interaction to be inside it. The
// notebook mounts when the user opens its tab, which counts as one, and so
// does picking a search result in it (see enterNotebook), although keyboard
// focus stays in the Search panel.
const useLastInteractionInNotebook = () => {
  const insideRef = useRef(true)

  useEffect(() => {
    const trackInteraction = (event: Event) => {
      const target = event.target
      if (!(target instanceof Element) || isPasteSink(target)) return
      insideRef.current = target.closest(NOTEBOOK_ROOT_SELECTOR) !== null
    }
    document.addEventListener("pointerdown", trackInteraction, true)
    document.addEventListener("focusin", trackInteraction, true)
    return () => {
      document.removeEventListener("pointerdown", trackInteraction, true)
      document.removeEventListener("focusin", trackInteraction, true)
    }
  }, [])

  return insideRef
}

export const useCellShortcuts = (
  focusedCellId: string | null,
): { enterNotebook: () => void } => {
  const {
    copyCell,
    cutCell,
    duplicateCell,
    deleteCell,
    pasteCells,
    undo,
    redo,
  } = useCellEditActions()
  const lastInteractionInNotebookRef = useLastInteractionInNotebook()

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const shortcut = cellShortcutOf(event)
      if (!shortcut || !lastInteractionInNotebookRef.current) return
      if (
        isBlockedByDrawer(shortcut, focusedCellId) ||
        isCellShortcutHandledElsewhere(
          event,
          shortcut,
          document.activeElement,
          window.getSelection(),
        )
      ) {
        return
      }
      if (shortcut === "undo" || shortcut === "redo") {
        event.preventDefault()
        if (shortcut === "undo") undo("shortcut")
        else redo("shortcut")
        return
      }
      if (shortcut === "paste") {
        redirectNextPaste((data) => {
          const payload = parseCellClipboardPayload(
            data.getData(CELL_CLIPBOARD_MIME),
          )
          if (payload) {
            pasteCells(payload, focusedCellId ?? undefined, "shortcut")
          }
        })
        return
      }
      if (!focusedCellId) return
      event.preventDefault()
      const actOnCell = {
        copy: copyCell,
        cut: cutCell,
        duplicate: duplicateCell,
        delete: deleteCell,
      }
      void actOnCell[shortcut](focusedCellId, "shortcut")
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [
    focusedCellId,
    copyCell,
    cutCell,
    duplicateCell,
    deleteCell,
    pasteCells,
    undo,
    redo,
    lastInteractionInNotebookRef,
  ])

  const enterNotebook = useCallback(() => {
    lastInteractionInNotebookRef.current = true
  }, [lastInteractionInNotebookRef])

  return { enterNotebook }
}
