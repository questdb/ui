import React, { useCallback, useEffect, useRef } from "react"
import { useNotebookActions } from "../NotebookProvider"
import { useEditor } from "../../../../providers/EditorProvider"
import { emitUserAction } from "../../../../utils/notebookAIBridge"

// Wrapper-level interactions shared by every cell kind (SQL and markdown) so
// they behave identically and can't drift: click-to-focus, arrow-key reorder
// (list mode), and Esc-to-blur. The selector that decides "did the user click
// an interactive element" is the single source of truth for both cells.
const INTERACTIVE_SELECTOR =
  "button, a, input, select, textarea, [contenteditable], .monaco-editor"

type Options = {
  cellId: string
  layoutMode: "list" | "grid"
  isMaximized: boolean
  isFocused: boolean
}

export const useCellWrapperInteractions = ({
  cellId,
  layoutMode,
  isMaximized,
  isFocused,
}: Options) => {
  const { moveCellUp, moveCellDown, setFocusedCell } = useNotebookActions()
  const { activeBuffer } = useEditor()
  const bufferIdForEvents =
    typeof activeBuffer.id === "number" ? activeBuffer.id : undefined

  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const canArrowMove = layoutMode !== "grid" && !isMaximized

  // Esc blurs the cell. Respect defaultPrevented so a Radix popper close
  // doesn't double up with cell blur on the same keystroke.
  useEffect(() => {
    if (!isFocused) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      if (e.defaultPrevented) return
      setFocusedCell(null)
      ;(document.activeElement as HTMLElement | null)?.blur?.()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [isFocused, setFocusedCell])

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!canArrowMove || e.target !== e.currentTarget) return
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return
      e.preventDefault()
      if (e.key === "ArrowUp") moveCellUp(cellId)
      else moveCellDown(cellId)
      if (bufferIdForEvents !== undefined) {
        emitUserAction({
          kind: "user_moved_cell",
          bufferId: bufferIdForEvents,
          cellId,
        })
      }
      requestAnimationFrame(() => {
        const node = wrapperRef.current
        if (!node) return
        node.focus({ preventScroll: true })
        node.scrollIntoView({ block: "nearest" })
      })
    },
    [canArrowMove, cellId, moveCellUp, moveCellDown, bufferIdForEvents],
  )

  const onMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement
      if (!target.closest?.(".cell-drag-handle")) {
        e.stopPropagation()
      }
      setFocusedCell(cellId)
      if (canArrowMove && !target.closest(INTERACTIVE_SELECTOR)) {
        wrapperRef.current?.focus({ preventScroll: true })
      }
    },
    [canArrowMove, cellId, setFocusedCell],
  )

  return {
    wrapperRef,
    canArrowMove,
    wrapperHandlers: { onKeyDown, onMouseDown },
  }
}
