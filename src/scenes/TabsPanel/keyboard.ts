import type React from "react"

type ActivationKeyEvent = Pick<
  React.KeyboardEvent,
  "key" | "target" | "currentTarget"
>

// Enter/Space pressed on the row/header itself. Keys bubbling up from a nested
// button (Close, Delete, Reopen, "Delete all") are ignored so the browser can
// activate that button natively instead of the container's action.
export const isOwnActivationKey = (event: ActivationKeyEvent): boolean =>
  event.target === event.currentTarget &&
  (event.key === "Enter" || event.key === " ")

const ROW_SELECTOR = '[data-hook="tabs-panel-row"]'
const ROW_BUTTON_SELECTOR = '[data-hook="tabs-panel-row-button"]'

// Close and Delete remove (or move) the row that holds the focused action.
// Focus goes to the next row's button, or the previous one, before that
// happens, so a keyboard user keeps their place in the panel instead of
// landing in the editor or on the page body.
export const focusNeighbourRow = (action: Element) => {
  const row = action.closest(ROW_SELECTOR)
  const panel = action.closest('[data-hook="tabs-panel"]')
  if (!row || !panel) return
  const rows = Array.from(panel.querySelectorAll(ROW_SELECTOR))
  const index = rows.indexOf(row)
  const neighbour = rows[index + 1] ?? rows[index - 1]
  neighbour?.querySelector<HTMLElement>(ROW_BUTTON_SELECTOR)?.focus()
}
