import React, { useCallback, useEffect, useRef } from "react"
import styled from "styled-components"
import { color } from "../../../../utils"
import { SideChip } from "./chips"

// Matches the grid EdgeHandle `s` (south) affordance: a 2px pink line plus a
// grip chip, revealed on hover, so list-mode resizing looks like grid.
//
// `$overlay` is the cell's bottom-edge handle: rather than an in-flow bar
// (which would clip its chip against the cell border), it's an absolute strip
// straddling the cell's bottom edge — like grid's `s` handle — so the line sits
// on the border and the chip overflows outside the cell (the parent shell and
// list container are overflow-visible).
const Handle = styled.div<{
  $background?: string
  $doubleView?: boolean
  $overlay?: boolean
}>`
  cursor: ns-resize;
  z-index: 2;
  flex-shrink: 0;
  outline: none;
  color: ${color("pinkPrimary")};
  --chip-bg: ${color("backgroundDarker")};

  ${({ $overlay, $doubleView, $background, theme }) =>
    $overlay
      ? `
    position: absolute;
    /* Inset from the corners (like grid's s handle) so the handle and its line
       clear the cell's rounded bottom border instead of poking past it. */
    left: 10px;
    right: 10px;
    bottom: -10px;
    height: 20px;
    background: transparent;
  `
      : `
    position: relative;
    height: ${$doubleView ? "6px" : "10px"};
    background: ${$background ?? theme.color.backgroundLighter};
  `}

  .resize-line,
  .resize-chip {
    opacity: 0;
    transition: opacity 0.1s;
    pointer-events: none;
  }

  &:hover .resize-line,
  &:focus-visible .resize-line,
  &:hover .resize-chip,
  &:focus-visible .resize-chip {
    opacity: 1;
  }

  .resize-line {
    position: absolute;
    left: 0;
    right: 0;
    top: 50%;
    transform: translateY(-50%);
    height: 2px;
    background: ${color("pinkPrimary")};
  }

  .resize-chip {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%) rotate(90deg);
    line-height: 0;
  }
`

type Props = {
  targetRef: React.RefObject<HTMLElement | null>
  onResize: (height: number) => void
  onResizeEnd: (height: number) => void
  onDoubleClick: () => void
  minHeight?: number
  background?: string
  doubleView?: boolean
  // The cell's bottom-edge handle: an absolute strip straddling the cell edge
  // (vs the in-flow editor/result divider), so its chip shows outside the cell.
  overlay?: boolean
}

export const ResizeHandle: React.FC<Props> = ({
  targetRef,
  onResize,
  onResizeEnd,
  onDoubleClick,
  minHeight = 48,
  background,
  doubleView,
  overlay,
}) => {
  const startYRef = useRef(0)
  const startHeightRef = useRef(0)
  const lastHeightRef = useRef(0)
  const endDragRef = useRef<(() => void) | null>(null)

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      startYRef.current = e.clientY

      if (!targetRef.current) return
      startHeightRef.current = targetRef.current.getBoundingClientRect().height
      lastHeightRef.current = startHeightRef.current

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const delta = moveEvent.clientY - startYRef.current
        const newHeight = Math.max(minHeight, startHeightRef.current + delta)
        lastHeightRef.current = newHeight
        onResize(newHeight)
      }

      const endDrag = () => {
        document.removeEventListener("mousemove", handleMouseMove)
        document.removeEventListener("mouseup", handleMouseUp)
        document.body.style.cursor = ""
        document.body.style.userSelect = ""
        endDragRef.current = null
      }

      const handleMouseUp = () => {
        endDrag()
        onResizeEnd(lastHeightRef.current)
      }

      document.body.style.cursor = "ns-resize"
      document.body.style.userSelect = "none"
      document.addEventListener("mousemove", handleMouseMove)
      document.addEventListener("mouseup", handleMouseUp)
      endDragRef.current = endDrag
    },
    [targetRef, onResize, onResizeEnd, minHeight],
  )

  // Enter/Space on a focused handle resets to default. This is the only
  // keyboard-accessible interaction we offer — mouse-drag resizing has no
  // ergonomic keyboard equivalent here, so don't pretend otherwise in
  // the aria-label.
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault()
        onDoubleClick()
      }
    },
    [onDoubleClick],
  )

  useEffect(() => () => endDragRef.current?.(), [])

  return (
    <Handle
      $background={background}
      $doubleView={doubleView}
      $overlay={overlay}
      onMouseDown={handleMouseDown}
      onDoubleClick={onDoubleClick}
      onKeyDown={handleKeyDown}
      role="separator"
      aria-orientation="horizontal"
      // Sighted mouse users hover for the tooltip; screen-reader users
      // hear the aria-label. Two audiences, two affordances.
      aria-label="Resize handle. Press Enter to reset to default size."
      title="Drag to resize. Double-click to reset."
      tabIndex={0}
    >
      <span className="resize-line" />
      <span className="resize-chip">
        <SideChip />
      </span>
    </Handle>
  )
}
