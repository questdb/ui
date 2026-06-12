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
