import styled, { css } from "styled-components"
import { color } from "../../../../utils"

// `data-notebook-cell` marker is read by the container's click-outside-to-blur logic to detect clicks landing inside a cell.
export const CellWrapper = styled.div.attrs({
  "data-notebook-cell": "true",
})<{
  $focused: boolean
  $maximized: boolean
  $gridMode?: boolean
}>`
  position: relative;
  border: 1px solid ${({ theme }) => theme.color.borderDefault};
  background: ${color("surfaceRaised")};
  border-radius: 0.8rem;
  overflow: hidden;
  min-width: 0;
  transition: all 0.15s ease;

  ${({ $focused }) =>
    $focused &&
    css`
      border-color: ${color("contentAccent")};
      box-shadow:
        0 0 0 3px ${color("interactionAccentActive")},
        0 1px 2px ${color("shadowSubtle")},
        0 4px 10px ${color("shadowSoft")};
    `}

  ${({ $focused }) =>
    !$focused &&
    css`
      &:hover {
        border-color: ${color("borderDefault")};
        box-shadow:
          0 1px 2px ${color("shadowSubtle")},
          0 3px 8px ${color("shadowSoft")};
      }
    `}

  ${({ $maximized }) =>
    $maximized &&
    css`
      flex: 1;
      display: flex;
      flex-direction: column;
      border: none;
      border-radius: 0;
    `}

  ${({ $gridMode }) =>
    $gridMode &&
    css`
      flex: 1;
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
      > *:last-child {
        flex-grow: 1;
      }
    `}

  ${({ $gridMode }) =>
    !$gridMode &&
    css`
      .cell-drag-handle,
      .cell-drag-handle:active {
        cursor: default;
      }
    `}

  &:focus {
    outline: none;
  }

  &:hover .cell-toolbar,
  &:focus-within .cell-toolbar {
    opacity: 1;
  }
`
