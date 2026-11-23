// Every focus move the chat makes on its own goes through here: it never
// takes focus from a control outside the chat, like the SQL editor the user
// types in.
export const focusWithinChat = (target: HTMLElement | null) => {
  if (!target) return
  const active = document.activeElement
  const panel = target.closest("[data-chat-panel]")
  if (!active || active === document.body || panel?.contains(active)) {
    target.focus()
  }
}
