import styled, { css, keyframes } from "styled-components"
import { color } from "../../utils"
import { theme } from "../../theme"
import { CopyButton } from "../CopyButton"
import {
  CELL_BORDER_PX,
  CELL_FONT_SIZE_PX,
  CELL_PADDING_PX,
  HEADER_BORDER_PX,
  HEADER_GAP_PX,
  HEADER_HEIGHT,
  HEADER_NAME_FONT_SIZE_PX,
  HEADER_PADDING_PX,
  HEADER_TYPE_FONT_SIZE_PX,
  ROW_HEIGHT,
} from "./dimensions"

export { HEADER_HEIGHT, ROW_HEIGHT }

export const GridContainer = styled.div`
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  outline: none;
  font-size: ${({ theme }) => theme.fontSize.xs};
  position: relative;
  isolation: isolate;
`

export const ScrollContainer = styled.div<{ $scrollable: boolean }>`
  flex: 1;
  overflow: ${({ $scrollable }) => ($scrollable ? "auto" : "hidden")};
`

export const HeaderRow = styled.div<{ $shadowBottom: boolean }>`
  display: flex;
  background: ${color("backgroundDarker")};
  border-bottom: 1px solid ${color("selection")};
  flex-shrink: 0;
  height: ${HEADER_HEIGHT}px;
  box-shadow: ${({ $shadowBottom }) =>
    $shadowBottom ? "0 2px 4px rgba(0, 0, 0, 0.3)" : "none"};
  transition: box-shadow 0.15s;
`

export const HeaderCell = styled.div<{ $align: string; $frozen?: boolean }>`
  position: relative;
  flex-shrink: 0;
  padding: 0.5rem ${HEADER_PADDING_PX / 2}px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  user-select: none;
  text-align: ${({ $align }) => $align};
  border-right: ${HEADER_BORDER_PX}px solid ${color("selection")};
  /* Sticky-left: opaque background so scrolled-under headers don't show through. */
  ${({ $frozen }) =>
    $frozen &&
    css`
      background: ${color("backgroundDarker")};
      justify-content: flex-start;
    `}

  &:hover .header-copy-btn,
  &:focus-within .header-copy-btn {
    visibility: visible;
  }
`

export const HeaderNameRow = styled.div<{ $align: string }>`
  display: flex;
  align-items: center;
  flex-direction: ${({ $align }) =>
    $align === "right" ? "row-reverse" : "row"};
  justify-content: flex-start;
  gap: ${HEADER_GAP_PX}px;
`

export const HeaderName = styled.span`
  color: ${color("cyan")};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
  font-size: ${HEADER_NAME_FONT_SIZE_PX}px;
`

export const HeaderType = styled.span`
  color: ${color("gray2")};
  font-size: ${HEADER_TYPE_FONT_SIZE_PX}px;
  white-space: nowrap;
  text-transform: lowercase;
`

export const StyledCopyButton = styled(CopyButton)`
  visibility: hidden;
  flex-shrink: 0;
  padding: 0;

  &:hover {
    background: transparent !important;
  }
`

export const ColResizer = styled.div`
  position: absolute;
  right: -10px;
  top: 0;
  bottom: 0;
  width: 20px;
  cursor: col-resize;
  touch-action: none;
  user-select: none;
  pointer-events: auto;
  z-index: 2;

  &::after {
    content: "";
    position: absolute;
    left: 50%;
    top: 25%;
    transform: translateX(-50%);
    width: 5px;
    height: 50%;
    border-radius: 2px;
    background: transparent;
    transition: background 0.1s;
  }

  &:hover::after {
    background: ${color("cyan")};
  }
`

export const ResizerOverlay = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: ${HEADER_HEIGHT}px;
  pointer-events: none;
  z-index: 6;
`

export const ResizeGhost = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: ${color("cyan")};
  pointer-events: none;
  /* Above the resizer overlay (z-index 6) so the drag line isn't clipped. */
  z-index: 7;
`

export const Row = styled.div<{ $active: boolean }>`
  display: flex;
  height: ${ROW_HEIGHT}px;

  ${({ $active }) =>
    $active &&
    css`
      background: ${color("selectionDarker")};
    `}

  ${({ $active }) =>
    !$active &&
    css`
      &:hover {
        background: ${color("selectionDarker")};

        [data-frozen="true"] {
          background: ${color("selectionDarker")};
        }
      }
    `}
`

const pulseAnim = keyframes`
  0% { box-shadow: ${theme.color.cyan} 0 0 0 1px; }
  75% { box-shadow: ${theme.color.yellow}00 0 0 0 16px; }
`

export const Cell = styled.div<{
  $isNull: boolean
  $isTimestamp: boolean
  $isActive: boolean
  $isPulsing: boolean
  $frozen?: boolean
  $rowActive?: boolean
}>`
  flex-shrink: 0;
  height: ${ROW_HEIGHT}px;
  display: flex;
  align-items: center;
  padding: 0 ${CELL_PADDING_PX / 2}px;
  overflow: hidden;
  font-size: ${CELL_FONT_SIZE_PX}px;
  color: ${({ $isNull, $isTimestamp }) =>
    $isNull
      ? color("mutedLabel")
      : $isTimestamp
        ? color("green")
        : color("foreground")};
  border-right: ${CELL_BORDER_PX}px solid ${color("selection")};
  border-bottom: 1px solid ${color("selection")};
  box-sizing: border-box;
  /* contain: layout, not paint — paint would clip the copy-pulse glow. */
  contain: layout;

  ${({ $frozen, $rowActive }) =>
    $frozen &&
    css`
      background: ${$rowActive
        ? color("selectionDarker")
        : color("background")};
    `}

  ${({ $isActive }) =>
    $isActive &&
    css`
      background: ${color("tableSelection")};
      box-shadow: inset 0 0 0 1px ${color("cyan")};
      border-radius: 0.4rem;
    `}

  ${({ $isPulsing }) =>
    $isPulsing &&
    css`
      animation: ${pulseAnim} 1s ease-out;
    `}
`

export const CellText = styled.div`
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

export const CellTooltipAnchor = styled.div`
  position: fixed;
  z-index: 3;
  pointer-events: none;
`

export const CellTooltipTextColumn = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
`

export const CellTooltipValue = styled.div`
  max-height: min(40vh, 280px);
  overflow: hidden;
  white-space: pre-wrap;
  word-break: break-all;
`

export const CellTooltipNote = styled.div`
  margin-top: 0.6rem;
  color: ${color("mutedLabel")};
  font-size: ${({ theme }) => theme.fontSize.xs};
`

export const CellTooltipCopyButton = styled(CopyButton).attrs({
  iconOnly: true,
  size: "sm",
})`
  margin-left: auto;
  background: transparent;
`

export const FrozenShadow = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  width: 16px;
  background: linear-gradient(to right, rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0));
  pointer-events: none;
  z-index: 3;
`

// Narrow so the adjacent column's resizer stays reachable.
export const FreezeHandle = styled.div<{
  $dragging?: boolean
  $flush?: boolean
}>`
  position: absolute;
  top: 0;
  bottom: 0;
  width: 8px;
  margin-left: -4px;
  cursor: col-resize;
  touch-action: none;
  user-select: none;
  z-index: 5;

  &::after {
    content: "";
    position: absolute;
    left: 50%;
    top: 0;
    bottom: 0;
    width: 2px;
    transform: translateX(-50%);
    background: transparent;
    transition: background 0.1s;
  }

  /* With nothing frozen the handle sits flush against the grid's left edge: no
     centering margin (so it isn't clipped), and the indicator aligns to the
     edge so it matches the drag ghost's 0-frozen position at x=0. */
  ${({ $flush }) =>
    $flush &&
    css`
      margin-left: 0;
      &::after {
        left: 0;
        transform: none;
      }
    `}

  /* While dragging, the ResizeGhost is the only indicator — the handle's own
     hover bar would otherwise show as a redundant second ghost. */
  ${({ $dragging }) =>
    !$dragging &&
    css`
      &:hover::after {
        background: ${color("cyan")};
      }
    `}
`
