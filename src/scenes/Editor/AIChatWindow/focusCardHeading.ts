// A new card announces itself by focusing its heading, but never takes focus
// from a control outside the chat, like the SQL editor the user types in.
export const focusCardHeading = (heading: HTMLElement | null) => {
  if (!heading) return
  const active = document.activeElement
  const panel = heading.closest("[data-chat-panel]")
  if (!active || active === document.body || panel?.contains(active)) {
    heading.focus()
  }
}
