/**
 * Escape: one model for the whole console.
 *
 * Escape closes the innermost thing the user is in, one thing per press.
 *
 * 1. Claim, don't stop. A handler that acts on Escape claims it with
 *    `claimEscape` (preventDefault) and every handler ignores an Escape that
 *    is already claimed (`isEscapeClaimed`). Nothing stops propagation for
 *    Escape, so unrelated listeners keep working; `defaultPrevented` is the
 *    only signal.
 *
 * 2. Layers, innermost first:
 *    a. Overlays (Radix menus, popovers, dialogs and tooltips, PopperToggle,
 *       the notebook settings drawer) listen in the capture phase, so the
 *       topmost overlay always closes first.
 *    b. Focused controls (a text field that clears itself, an inline rename,
 *       a grid cell selection) handle Escape on the element itself.
 *    c. Ambient layers (notebook cell focus, a pending AI diff, a side panel)
 *       register with `useEscapeLayer` and receive only Escapes that nothing
 *       above claimed. A global layer (a pending decision Escape answers,
 *       wherever the focus is) goes first; then a layer whose element contains
 *       the focus; otherwise the highest `EscapePriority` wins.
 *
 * 3. A text field that still holds text owns Escape: ambient layers other than
 *    global ones ignore it. This is decided from the value at the moment the
 *    key was pressed, before a handler could clear it, so clearing a field
 *    never also closes a panel. A field that acts on Escape claims it, so a
 *    global layer never sees that press either.
 */

export const EscapePriority = {
  // A focused notebook cell is cleared before anything around it closes.
  notebookCell: 30,
  // A pending AI suggestion in the SQL editor (the diff shows an Esc hint).
  editorDiff: 20,
  // A docked side panel (AI chat) closes last.
  sidePanel: 10,
} as const

export type EscapeLayer = {
  priority: number
  // Escape pressed inside this element reaches this layer before others.
  scope?: () => Element | null
  // Called with an unclaimed Escape. Return true when the layer acted.
  onEscape: (event: KeyboardEvent) => boolean
  // A pending decision that Escape answers from anywhere, even from a text
  // field holding text that does not act on Escape itself (e.g. a draft in the
  // AI chat input while its suggested diff is pending).
  global?: boolean
}

type EscapeEvent = { key: string; defaultPrevented: boolean }

export const isEscape = (event: { key: string }) => event.key === "Escape"

export const claimEscape = (event: { preventDefault: () => void }) =>
  event.preventDefault()

export const isEscapeClaimed = (event: EscapeEvent) => event.defaultPrevented

// Inputs whose `value` is not text the user typed: a checkbox reports "on".
const NON_TEXT_INPUT_TYPES = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
])

// Monaco keeps a hidden textarea for input; it is not a text field the user
// sees, and the editor handles its own Escape bindings.
export const isTextFieldWithValue = (target: EventTarget | null) =>
  ((target instanceof HTMLInputElement &&
    !NON_TEXT_INPUT_TYPES.has(target.type)) ||
    target instanceof HTMLTextAreaElement) &&
  target.value.length > 0 &&
  !target.closest(".monaco-editor")

const layers: EscapeLayer[] = []
const ownedByTextField = new WeakSet<Event>()

const onCapture = (event: KeyboardEvent) => {
  if (isEscape(event) && isTextFieldWithValue(event.target))
    ownedByTextField.add(event)
}

const contains = (layer: EscapeLayer, target: EventTarget | null) => {
  const scope = layer.scope?.()
  return !!scope && target instanceof Node && scope.contains(target)
}

// Global layers by priority, then layers containing the target, innermost
// first, then the rest by priority. Ties go to the most recently registered
// layer. A press a text field owns reaches only the global layers.
const dispatchOrder = (
  target: EventTarget | null,
  ownedByField: boolean,
): EscapeLayer[] => {
  const latestFirst = [...layers].reverse()
  const byPriority = (a: EscapeLayer, b: EscapeLayer) => b.priority - a.priority
  const global = latestFirst.filter((layer) => layer.global).sort(byPriority)
  if (ownedByField) return global
  const ambient = latestFirst.filter((layer) => !layer.global)
  const scoped = ambient
    .filter((layer) => contains(layer, target))
    .sort((a, b) => (a.scope?.()?.contains(b.scope?.() ?? null) ? 1 : -1))
  const rest = ambient
    .filter((layer) => !scoped.includes(layer))
    .sort(byPriority)
  return [...global, ...scoped, ...rest]
}

const onBubble = (event: KeyboardEvent) => {
  if (!isEscape(event) || isEscapeClaimed(event)) return
  for (const layer of dispatchOrder(
    event.target,
    ownedByTextField.has(event),
  )) {
    if (layer.onEscape(event)) {
      claimEscape(event)
      return
    }
  }
}

export const registerEscapeLayer = (layer: EscapeLayer): (() => void) => {
  if (layers.length === 0) {
    window.addEventListener("keydown", onCapture, true)
    window.addEventListener("keydown", onBubble)
  }
  layers.push(layer)
  return () => {
    const index = layers.indexOf(layer)
    if (index !== -1) layers.splice(index, 1)
    if (layers.length === 0) {
      window.removeEventListener("keydown", onCapture, true)
      window.removeEventListener("keydown", onBubble)
    }
  }
}
