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
  border: 1px solid ${color("baseGrey")};
  background: ${color("backgroundLighter")};
  border-radius: 0.6rem;
  overflow: hidden;
  min-width: 0;
  transition: all 0.15s ease;

  ${({ $focused }) =>
    $focused &&
    css`
      border-color: ${color("pinkDarker")};
      /* pinkPrimary @ 30% — selected-cell glow ring */
      box-shadow: 0 0 0 3px rgba(201, 50, 97, 0.3);
    `}

  ${({ $focused }) =>
    !$focused &&
    css`
      &:hover {
        box-shadow: 0px 0px 10px 1px ${color("backgroundDarker")};
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
