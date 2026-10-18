import type { Id } from "react-toastify"

// Weak keys let removed toast DOM (and its saved origin) be collected. Only
// shortcut-driven focus moves establish an origin; ordinary tabbing does not.
export const notificationFocusOrigins = new WeakMap<HTMLElement, HTMLElement>()

export const isNotificationFocusTransfer = (
  origin: HTMLElement,
  target: HTMLElement | null,
) => {
  const notification = target?.closest?.<HTMLElement>(".Toastify__toast")
  return !!notification && notificationFocusOrigins.get(notification) === origin
}

export const restoreNotificationFocus = (id?: Id) => {
  const notification =
    typeof document === "undefined"
      ? null
      : document.activeElement?.closest<HTMLElement>(".Toastify__toast")
  const origin = notification && notificationFocusOrigins.get(notification)
  if (
    notification &&
    (id === undefined || notification.id === String(id)) &&
    origin?.isConnected
  ) {
    // Toastify's onClose runs after removal, when focus has already fallen
    // to body. Restore before dismissal, but only while this toast owns focus.
    origin.focus()
  }
}
