import React, { useCallback, useEffect, useRef, useState } from "react"
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
  z-index: 10;
  flex-shrink: 0;
  outline: none;
  color: ${color("contentAccentStrong")};

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
    background: ${$background ?? theme.color.surfaceRaised};
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
    background: ${color("contentAccentStrong")};
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
  minHeight: number
  maxHeight: number
  ariaLabel: string
  background?: string
  doubleView?: boolean
  // The cell's bottom-edge handle: an absolute strip straddling the cell edge
  // (vs the in-flow editor/result divider), so its chip shows outside the cell.
  overlay?: boolean
}

// A press only becomes a drag once the pointer travels this far; below it,
// mouseup is a click and must not commit a resize (which would pin the
// cell's auto-height).
const DRAG_THRESHOLD_PX = 3
const KEYBOARD_STEP_PX = 10
const KEYBOARD_LARGE_STEP_PX = 50

export const resizeHeightForKey = (
  key: string,
  currentHeight: number,
  minHeight: number,
  maxHeight: number,
  largeStep = false,
): number | null => {
  const step = largeStep ? KEYBOARD_LARGE_STEP_PX : KEYBOARD_STEP_PX
  let next: number
  switch (key) {
    case "ArrowUp":
      next = currentHeight - step
      break
    case "ArrowDown":
      next = currentHeight + step
      break
    case "Home":
      next = minHeight
      break
    case "End":
      next = maxHeight
      break
    default:
      return null
  }
  return Math.min(maxHeight, Math.max(minHeight, next))
}

export const ResizeHandle: React.FC<Props> = ({
  targetRef,
  onResize,
  onResizeEnd,
  onDoubleClick,
  minHeight,
  maxHeight,
  ariaLabel,
  background,
  doubleView,
  overlay,
}) => {
  const [targetHeight, setTargetHeight] = useState<number>()
  const startYRef = useRef(0)
  const startHeightRef = useRef(0)
  const lastHeightRef = useRef(0)
  const endDragRef = useRef<(() => void) | null>(null)

  const clampHeight = useCallback(
    (height: number) => Math.min(maxHeight, Math.max(minHeight, height)),
    [maxHeight, minHeight],
  )

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      startYRef.current = e.clientY

      if (!targetRef.current) return
      startHeightRef.current = targetRef.current.getBoundingClientRect().height
      lastHeightRef.current = startHeightRef.current
      let dragged = false

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const delta = moveEvent.clientY - startYRef.current
        if (!dragged && Math.abs(delta) < DRAG_THRESHOLD_PX) return
        dragged = true
        const newHeight = clampHeight(startHeightRef.current + delta)
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
        if (dragged) onResizeEnd(lastHeightRef.current)
      }

      document.body.style.cursor = "ns-resize"
      document.body.style.userSelect = "none"
      document.addEventListener("mousemove", handleMouseMove)
      document.addEventListener("mouseup", handleMouseUp)
      endDragRef.current = endDrag
    },
    [targetRef, onResize, onResizeEnd, clampHeight],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault()
        onDoubleClick()
        return
      }
      if (!targetRef.current) return
      const next = resizeHeightForKey(
        e.key,
        targetRef.current.getBoundingClientRect().height,
        minHeight,
        maxHeight,
        e.shiftKey,
      )
      if (next === null) return
      e.preventDefault()
      onResize(next)
      onResizeEnd(next)
    },
    [maxHeight, minHeight, onDoubleClick, onResize, onResizeEnd, targetRef],
  )

  useEffect(() => {
    const target = targetRef.current
    if (!target) return
    const observer = new ResizeObserver(() =>
      setTargetHeight(Math.round(target.getBoundingClientRect().height)),
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [targetRef])

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
      aria-label={ariaLabel}
      aria-valuemin={Math.round(minHeight)}
      aria-valuemax={Math.round(maxHeight)}
      aria-valuenow={targetHeight}
      title="Drag or use arrow keys to resize. Double-click or press Enter to reset."
      tabIndex={0}
    >
      <span className="resize-line" />
      <span className="resize-chip">
        <SideChip />
      </span>
    </Handle>
  )
}
