import React from "react"
import styled from "styled-components"
import { color } from "../../../../utils"
import { eventBus } from "../../../../modules/EventBus"
import { EventType } from "../../../../modules/EventBus/types"

const Handle = styled.div<{ $axis: string }>`
  position: absolute;
  z-index: 2;
  outline: none;

  &::after {
    content: "";
    position: absolute;
    background: transparent;
    transition: background 0.1s;
  }

  &:hover::after,
  &:focus-visible::after,
  &:active::after,
  &:hover::before,
  &:focus-visible::before,
  &:active::before {
    background: ${color("pinkDarker")};
  }

  ${({ $axis }) =>
    $axis === "s" &&
    `
    bottom: -10px;
    left: 10px;
    right: 10px;
    height: 20px;
    cursor: ns-resize;
    &::after {
      left: 0;
      right: 0;
      top: 50%;
      transform: translateY(-50%);
      height: 6px;
    }
  `}

  ${({ $axis }) =>
    $axis === "e" &&
    `
    right: -10px;
    top: 10px;
    bottom: 10px;
    width: 20px;
    cursor: ew-resize;
    &::after {
      top: 0;
      bottom: 0;
      left: 50%;
      transform: translateX(-50%);
      width: 6px;
    }
  `}

  ${({ $axis }) =>
    $axis === "w" &&
    `
    left: -10px;
    top: 10px;
    bottom: 10px;
    width: 20px;
    cursor: ew-resize;
    &::after {
      top: 0;
      bottom: 0;
      left: 50%;
      transform: translateX(-50%);
      width: 6px;
    }
  `}

  ${({ $axis }) =>
    $axis === "se" &&
    `
    right: -10px;
    bottom: -10px;
    width: 20px;
    height: 20px;
    cursor: se-resize;
    background: transparent;

    &::before {
      content: "";
      position: absolute;
      background: transparent;
      transition: background 0.1s;
      left: 50%;
      top: 0;
      width: 6px;
      height: 50%;
      transform: translateX(-50%);
    }
    &::after {
      top: 50%;
      left: 0;
      width: 50%;
      height: 6px;
      transform: translateY(-50%);
    }
  `}
`

const dispatchAxisDoubleClick = (axis: string, target: HTMLElement): void => {
  const cellEl = target.closest<HTMLElement>("[data-cell-id]")
  const cellId = cellEl?.dataset.cellId
  if (!cellId) return
  if (axis === "s") {
    eventBus.publish(EventType.NOTEBOOK_CELL_RESET_SIZE, { cellId })
    return
  }
  if (axis === "e" || axis === "w") {
    eventBus.publish(EventType.NOTEBOOK_CELL_EXPAND_WIDTH, {
      cellId,
      kind: axis === "e" ? "right" : "left",
    })
  }
}

// Signature matches react-grid-layout's handleComponent prop.
export const renderEdgeHandle = (axis: string, ref: React.Ref<HTMLElement>) => (
  <Handle
    ref={ref as React.Ref<HTMLDivElement>}
    $axis={axis}
    data-axis={axis}
    role="separator"
    aria-orientation={axis === "s" || axis === "se" ? "horizontal" : "vertical"}
    aria-label={`Resize cell (${axis}) — drag to resize`}
    tabIndex={0}
    onDoubleClick={
      axis === "s" || axis === "e" || axis === "w"
        ? (e) => dispatchAxisDoubleClick(axis, e.currentTarget as HTMLElement)
        : undefined
    }
  />
)

export const EdgeHandle = Handle
