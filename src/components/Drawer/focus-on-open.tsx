import { useEffect } from "react"
import type { RefObject } from "react"

const CANDIDATES = "button, input, select, textarea, [tabindex]"

const isHidden = (element: HTMLElement, container: HTMLElement) => {
  for (
    let node: HTMLElement | null = element;
    node && node !== container;
    node = node.parentElement
  ) {
    const style = getComputedStyle(node)
    if (style.display === "none" || style.visibility === "hidden") return true
  }
  return false
}

// Links are skipped, as Radix's FocusScope skips them: landing on a link
// would read as an unintended navigation target.
const firstTabbable = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>(CANDIDATES)).find(
    (element) =>
      element.tabIndex >= 0 &&
      !element.matches(":disabled") &&
      !isHidden(element, container),
  )

// A docked side panel is not Radix dialog content (see Drawer), so it takes
// focus on open the way Radix's non-modal FocusScope did: the first tabbable
// element, else the panel itself, unless something inside already has focus.
// Rendered as the panel's last child, its effect runs after the panel's own
// content has focused what it wants. On close, focus that was left in the
// panel (or dropped to the page with it) returns to where it came from.
export const FocusOnOpen = ({
  container,
}: {
  container: RefObject<HTMLElement>
}) => {
  useEffect(() => {
    const panel = container.current
    if (!panel) return
    const previous = document.activeElement
    if (!panel.contains(previous)) {
      const target = firstTabbable(panel) ?? panel
      target.focus({ preventScroll: true })
      if (target instanceof HTMLInputElement) target.select()
    }
    return () => {
      const active = document.activeElement
      const leftInPanel =
        !active || active === document.body || panel.contains(active)
      if (
        leftInPanel &&
        previous instanceof HTMLElement &&
        previous !== document.body &&
        previous.isConnected &&
        !panel.contains(previous)
      )
        previous.focus({ preventScroll: true })
    }
  }, [container])
  return null
}
