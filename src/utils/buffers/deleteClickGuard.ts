// Per-row Delete buttons remove the row at once, and the next row slides up
// under the pointer. The second click of a double-click would then delete that
// neighbour too. Accept at most one delete click per window, across all rows
// and surfaces (Tabs panel, tab history dropdown).
export const DELETE_CLICK_WINDOW_MS = 500

let lastAcceptedAt = -Infinity

export const acceptDeleteClick = (now = Date.now()): boolean => {
  if (now - lastAcceptedAt < DELETE_CLICK_WINDOW_MS) return false
  lastAcceptedAt = now
  return true
}

export const resetDeleteClickGuard = () => {
  lastAcceptedAt = -Infinity
}
