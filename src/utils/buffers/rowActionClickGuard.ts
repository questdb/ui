// A row action (Close, Reopen, Delete) moves its row away at once, and the
// next row slides up under the pointer. The second click of a double-click
// would then act on that neighbour too. Accept at most one row action click
// per window, across all rows and surfaces (Tabs panel, tab history dropdown).
export const ROW_ACTION_CLICK_WINDOW_MS = 500

let lastAcceptedAt = -Infinity

export const acceptRowActionClick = (now = Date.now()): boolean => {
  if (now - lastAcceptedAt < ROW_ACTION_CLICK_WINDOW_MS) return false
  lastAcceptedAt = now
  return true
}

export const resetRowActionClickGuard = () => {
  lastAcceptedAt = -Infinity
}
