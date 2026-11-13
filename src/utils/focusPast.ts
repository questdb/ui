const TABBABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]",
].join(", ")

const precedes = (node: Node, other: Node) =>
  (node.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0

// Elements that cannot take focus (hidden, inside a closed panel) ignore
// focus(); the next candidate is tried then.
const focusFirst = (candidates: HTMLElement[]) =>
  candidates.some((element) => {
    element.focus()
    return document.activeElement === element
  })

// Keyboard focus that lands inside `container` continues to the first
// focusable element past it, in the direction the user moved: forward when
// it came from before the container, backward when it came from after it.
// Returns false when there is no such element.
export const focusPast = (container: Element, cameFrom: Element) => {
  const outside = Array.from(
    document.querySelectorAll<HTMLElement>(TABBABLE),
  ).filter((element) => element.tabIndex >= 0 && !container.contains(element))
  return precedes(cameFrom, container)
    ? focusFirst(outside.filter((element) => precedes(container, element)))
    : focusFirst(
        outside.filter((element) => precedes(element, container)).reverse(),
      )
}
