import React, { useCallback, useRef } from "react"
import styled from "styled-components"
import { color } from "../../../../utils"

const Handle = styled.div<{ $background?: string; $doubleView?: boolean }>`
  height: ${({ $doubleView }) => ($doubleView ? "6px" : "10px")};
  cursor: ns-resize;
  position: relative;
  flex-shrink: 0;
  background: ${({ $background }) => $background ?? color("backgroundLighter")};
  outline: none;

  &::after {
    content: "";
    position: absolute;
    left: 50%;
    top: 100%;
    transform: translateX(-50%) translateY(-50%);
    width: 100%;
    height: 50%;
    transition: background 0.1s;
    background: transparent;
  }

  &:hover::after,
  &:focus-visible::after {
    background: ${color("pinkDarker")};
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
}

export const ResizeHandle: React.FC<Props> = ({
  targetRef,
  onResize,
  onResizeEnd,
  onDoubleClick,
  minHeight = 48,
  background,
  doubleView,
}) => {
  const startYRef = useRef(0)
  const startHeightRef = useRef(0)
  const lastHeightRef = useRef(0)

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

      const handleMouseUp = () => {
        document.removeEventListener("mousemove", handleMouseMove)
        document.removeEventListener("mouseup", handleMouseUp)
        document.body.style.cursor = ""
        document.body.style.userSelect = ""
        onResizeEnd(lastHeightRef.current)
      }

      document.body.style.cursor = "ns-resize"
      document.body.style.userSelect = "none"
      document.addEventListener("mousemove", handleMouseMove)
      document.addEventListener("mouseup", handleMouseUp)
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

  return (
    <Handle
      $background={background}
      $doubleView={doubleView}
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
    />
  )
}
