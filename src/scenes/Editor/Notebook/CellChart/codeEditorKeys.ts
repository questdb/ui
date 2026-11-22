// Escape in a code editor field, shared by the settings drawer and dialogs.

// Monaco widgets that Escape closes before it leaves the editor.
export const MONACO_OPEN_WIDGET =
  ".suggest-widget.visible, .find-widget.visible, .parameter-hints-widget.visible"

// A code editor field's frame, focusable so Escape can leave the editor.
export const CODE_EDITOR_FRAME = "[data-hook='code-editor-field']"

/**
 * Escape pressed at `target`: inside a code editor it first closes the
 * editor's own widgets (Monaco does that), then leaves the editor for its
 * frame. True when the key was the editor's, so a dialog stays open.
 */
export const escapeInCodeEditor = (target: EventTarget | null): boolean => {
  const editor =
    target instanceof Element ? target.closest(".monaco-editor") : null
  if (!editor) return false
  if (!editor.querySelector(MONACO_OPEN_WIDGET))
    editor.closest<HTMLElement>(CODE_EDITOR_FRAME)?.focus()
  return true
}

const FOCUSABLE =
  "button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex='-1'])"

/** The first focusable control after `element` in `panel`, outside it. */
const controlAfter = (
  panel: HTMLElement | null,
  element: HTMLElement,
): HTMLElement | null =>
  Array.from(panel?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).find(
    (candidate) =>
      !element.contains(candidate) &&
      Boolean(
        element.compareDocumentPosition(candidate) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ),
  ) ?? null

/**
 * Tab from a code editor's frame (where Escape left the editor) moves on to
 * the next control in `panel` instead of back into the editor. True when it
 * moved focus.
 */
export const tabPastCodeEditor = (
  event: Pick<KeyboardEvent, "key" | "shiftKey" | "target" | "preventDefault">,
  panel: HTMLElement | null,
): boolean => {
  if (
    event.key !== "Tab" ||
    event.shiftKey ||
    !(event.target instanceof HTMLElement) ||
    !event.target.matches(CODE_EDITOR_FRAME) ||
    !panel?.contains(event.target)
  )
    return false
  const next = controlAfter(panel, event.target)
  if (!next) return false
  event.preventDefault()
  next.focus()
  return true
}
