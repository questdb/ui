import React, { useCallback, useRef } from "react"
import styled from "styled-components"
import { color } from "../../../../utils"

const Handle = styled.div<{ $background?: string }>`
  height: 10px;
  cursor: ns-resize;
  position: relative;
  flex-shrink: 0;
  background: ${({ $background }) => $background ?? color("backgroundLighter")};
  outline: none;

  &::after {
    content: "";
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translateX(-50%) translateY(-50%);
    width: 32px;
    height: 5px;
    border-radius: 4px;
    background: transparent;
    transition: background 0.1s;
  }

  &:hover::after,
  &:focus-visible::after {
    background: ${color("comment")};
  }
`

const KEYBOARD_STEP_PX = 16
const KEYBOARD_STEP_PX_LARGE = 64

type Props = {
  targetRef: React.RefObject<HTMLElement | null>
  onResize: (height: number) => void
  onResizeEnd: (height: number) => void
  onDoubleClick: () => void
  minHeight?: number
  background?: string
}

export const ResizeHandle: React.FC<Props> = ({
  targetRef,
  onResize,
  onResizeEnd,
  onDoubleClick,
  minHeight = 48,
  background,
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

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!targetRef.current) return
      const currentHeight = targetRef.current.getBoundingClientRect().height
      const step = e.shiftKey ? KEYBOARD_STEP_PX_LARGE : KEYBOARD_STEP_PX
      if (e.key === "ArrowDown") {
        e.preventDefault()
        const next = Math.max(minHeight, currentHeight + step)
        onResize(next)
        onResizeEnd(next)
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        const next = Math.max(minHeight, currentHeight - step)
        onResize(next)
        onResizeEnd(next)
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault()
        onDoubleClick()
      }
    },
    [targetRef, onResize, onResizeEnd, onDoubleClick, minHeight],
  )

  return (
    <Handle
      $background={background}
      onMouseDown={handleMouseDown}
      onDoubleClick={onDoubleClick}
      onKeyDown={handleKeyDown}
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize handle (Arrow keys to resize, Enter to reset)"
      tabIndex={0}
    />
  )
}
