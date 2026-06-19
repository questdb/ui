import { ROW_HEIGHT } from "./dimensions"

// Browsers cap element height (~17.9M px in Firefox); stay well under it.
export const MAX_CANVAS_PX = 10_000_000
export const MAX_VIRTUAL_ROWS = Math.floor(MAX_CANVAS_PX / ROW_HEIGHT)
// Past the cap, the last LEAP_TAIL_ROWS rows jump to the result's tail so the
// end stays reachable; the head scrolls 1:1.
export const LEAP_TAIL_ROWS = 1000

export const toAbsoluteIndex = (
  virtualIndex: number,
  rowCount: number,
): number => {
  if (rowCount <= MAX_VIRTUAL_ROWS) return virtualIndex
  const headCount = MAX_VIRTUAL_ROWS - LEAP_TAIL_ROWS
  if (virtualIndex < headCount) return virtualIndex
  return rowCount - (MAX_VIRTUAL_ROWS - virtualIndex)
}

// A window straddling the leap is not contiguous in absolute space, so it
// resolves to the segment (head or tail) holding more of the visible rows.
export const toVisibleAbsoluteRange = (
  firstVirtual: number,
  lastVirtual: number,
  rowCount: number,
): { firstIndex: number; lastIndex: number } => {
  const headCount = MAX_VIRTUAL_ROWS - LEAP_TAIL_ROWS
  const straddlesLeap =
    rowCount > MAX_VIRTUAL_ROWS &&
    firstVirtual < headCount &&
    lastVirtual >= headCount

  if (!straddlesLeap) {
    return {
      firstIndex: toAbsoluteIndex(firstVirtual, rowCount),
      lastIndex: toAbsoluteIndex(lastVirtual, rowCount),
    }
  }

  const headRows = headCount - firstVirtual
  const tailRows = lastVirtual - headCount + 1
  return headRows >= tailRows
    ? { firstIndex: firstVirtual, lastIndex: headCount - 1 }
    : {
        firstIndex: toAbsoluteIndex(headCount, rowCount),
        lastIndex: toAbsoluteIndex(lastVirtual, rowCount),
      }
}
