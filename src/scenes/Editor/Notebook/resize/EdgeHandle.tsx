import React from "react"
import styled from "styled-components"
import { color } from "../../../../utils"

// Purely visual — RGL owns the drag behaviour; visibility is driven by the parent .react-grid-item:hover.
const Handle = styled.div<{ $axis: string }>`
  position: absolute;
  z-index: 2;

  &::after {
    content: "";
    position: absolute;
    border-radius: 4px;
    background: transparent;
    transition: background 0.15s;
  }

  &:hover::after,
  &:active::after {
    background: ${color("comment")};
  }

  ${({ $axis }) =>
    $axis === "s" &&
    `
    bottom: -5px;
    left: 10px;
    right: 10px;
    height: 10px;
    cursor: ns-resize;
    &::after {
      left: 50%;
      top: 50%;
      transform: translateX(-50%) translateY(-50%);
      width: 32px;
      height: 5px;
    }
  `}

  ${({ $axis }) =>
    $axis === "e" &&
    `
    right: -5px;
    top: 10px;
    bottom: 10px;
    width: 10px;
    cursor: ew-resize;
    &::after {
      top: 50%;
      left: 50%;
      transform: translateX(-50%) translateY(-50%);
      width: 5px;
      height: 32px;
    }
  `}

  ${({ $axis }) =>
    $axis === "w" &&
    `
    left: -5px;
    top: 10px;
    bottom: 10px;
    width: 10px;
    cursor: ew-resize;
    &::after {
      top: 50%;
      left: 50%;
      transform: translateX(-50%) translateY(-50%);
      width: 5px;
      height: 32px;
    }
  `}

  ${({ $axis }) =>
    $axis === "se" &&
    `
    right: 0;
    bottom: 0;
    width: 16px;
    height: 16px;
    cursor: se-resize;
    &::after {
      right: 3px;
      bottom: 3px;
      width: 6px;
      height: 6px;
      border-radius: 0;
      border-right: 2px solid transparent;
      border-bottom: 2px solid transparent;
      background: transparent;
    }
  `}

  &[data-axis="se"]:hover::after,
  &[data-axis="se"]:active::after {
    border-color: ${color("comment")};
    background: transparent;
  }
`

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
  />
)

export const EdgeHandle = Handle
