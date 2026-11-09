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
