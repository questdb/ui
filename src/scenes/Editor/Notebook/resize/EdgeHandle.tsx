import React from "react"
import styled from "styled-components"
import { color } from "../../../../utils"
import { eventBus } from "../../../../modules/EventBus"
import { EventType } from "../../../../modules/EventBus/types"
import { trackEvent } from "../../../../modules/ConsoleEventTracker"
import { useNotebookBufferId } from "../NotebookProvider"
import { ConsoleEvent } from "../../../../modules/ConsoleEventTracker/events"
import { CornerChip, SideChip } from "./chips"

const isCorner = (axis: string): boolean => axis === "se" || axis === "sw"

const Handle = styled.div<{ $axis: string }>`
  position: absolute;
  z-index: 10;
  outline: none;
  color: ${color("contentAccentStrong")};

  /* Visuals are hidden until the handle is hovered; corner handles are also
     revealed when the cell is selected (rule lives on the grid container). */
  opacity: 0;
  transition: opacity 0.1s;

  &:hover {
    opacity: 1;
  }

  .edge-line {
    position: absolute;
    pointer-events: none;
    background: ${color("contentAccentStrong")};
  }

  .edge-chip {
    position: absolute;
    top: 50%;
    left: 50%;
    line-height: 0;
    pointer-events: none;
  }

  ${({ $axis }) =>
    $axis === "e" &&
    `
    right: -10px;
    top: 10px;
    bottom: 10px;
    width: 20px;
    cursor: ew-resize;
    .edge-line {
      top: 0;
      bottom: 0;
      left: 50%;
      transform: translateX(-50%);
      width: 2px;
    }
    .edge-chip { transform: translate(-50%, -50%); }
  `}

  ${({ $axis }) =>
    $axis === "w" &&
    `
    left: -10px;
    top: 10px;
    bottom: 10px;
    width: 20px;
    cursor: ew-resize;
    .edge-line {
      top: 0;
      bottom: 0;
      left: 50%;
      transform: translateX(-50%);
      width: 2px;
    }
    .edge-chip { transform: translate(-50%, -50%); }
  `}

  ${({ $axis }) =>
    $axis === "s" &&
    `
    bottom: -10px;
    left: 10px;
    right: 10px;
    height: 20px;
    cursor: ns-resize;
    .edge-line {
      left: 0;
      right: 0;
      top: 50%;
      transform: translateY(-50%);
      height: 2px;
    }
    .edge-chip { transform: translate(-50%, -50%) rotate(90deg); }
  `}

  ${({ $axis }) =>
    $axis === "se" &&
    `
    right: -10px;
    bottom: -10px;
    width: 20px;
    height: 20px;
    cursor: se-resize;
    .edge-chip { transform: translate(-50%, -50%) scaleY(-1); }
  `}

  ${({ $axis }) =>
    $axis === "sw" &&
    `
    left: -10px;
    bottom: -10px;
    width: 20px;
    height: 20px;
    cursor: sw-resize;
    .edge-chip { transform: translate(-50%, -50%) scale(-1, -1); }
  `}
`

const dispatchAxisDoubleClick = (
  axis: string,
  target: HTMLElement,
  notebookId: number,
): void => {
  const cellEl = target.closest<HTMLElement>("[data-cell-id]")
  const cellId = cellEl?.dataset.cellId
  if (!cellId) return
  if (axis === "s") {
    void trackEvent(ConsoleEvent.NOTEBOOK_CELL_SIZE_RESET, {
      notebookId,
      cellId,
    })
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

// react-resizable wraps the handle in DraggableCore, which clones it to
// inject onMouseDown/onMouseUp/onTouchEnd. Those must reach the DOM node or
// mouse resizing never starts, so forward every prop we don't own.
type NotebookEdgeHandleProps = React.HTMLAttributes<HTMLDivElement> & {
  axis: string
  handleRef: React.Ref<HTMLElement>
}

const NotebookEdgeHandle = ({
  axis,
  handleRef: ref,
  ...draggableProps
}: NotebookEdgeHandleProps) => {
  const notebookId = useNotebookBufferId()
  const corner = isCorner(axis)
  return (
    <Handle
      {...draggableProps}
      ref={ref as React.Ref<HTMLDivElement>}
      $axis={axis}
      className={`edge-handle edge-handle--${corner ? "corner" : "side"}`}
      data-axis={axis}
      role="separator"
      aria-orientation={axis === "s" || corner ? "horizontal" : "vertical"}
      aria-label={`Resize cell (${axis}) — drag to resize`}
      tabIndex={0}
      onDoubleClick={
        corner
          ? undefined
          : (e) =>
              dispatchAxisDoubleClick(
                axis,
                e.currentTarget as HTMLElement,
                notebookId,
              )
      }
    >
      {!corner && <span className="edge-line" />}
      <span className="edge-chip">
        {corner ? <CornerChip /> : <SideChip />}
      </span>
    </Handle>
  )
}

// Signature matches react-grid-layout's handleComponent prop.
export const renderEdgeHandle = (axis: string, ref: React.Ref<HTMLElement>) => (
  <NotebookEdgeHandle axis={axis} handleRef={ref} />
)
