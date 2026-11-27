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
 *    c. Ambient layers (notebook cell focus, a pending AI suggestion, a side
 *       panel) register with
 *       `useEscapeLayer` and receive only Escapes that nothing above
 *       claimed. A layer whose element contains the focus goes first;
 *       otherwise the highest `EscapePriority` wins.
 *
 * 3. A text field that still holds text owns Escape: ambient layers ignore
 *    it. This is decided from the value at the moment the key was pressed,
 *    before a handler could clear it, so clearing a field never also closes
 *    a panel.
 */

export const EscapePriority = {
  // A focused notebook cell is cleared before anything around it closes.
  notebookCell: 30,
  // A pending AI suggestion in the SQL editor (the Reject button shows Esc).
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

// Monaco calls preventDefault on every Escape in its input, handled or not.
// When a binding handles it (a widget closes, a selection collapses), Monaco
// also stops propagation, so the press never reaches the ambient layers. An
// Escape from the editor that does reach them is therefore unhandled, and its
// claim is whatever was made before the editor saw it. That is read by a
// capture listener on the target itself: it runs after every ancestor's
// capture listener (Radix layers included) and before Monaco's own listener.
const claimedBeforeEditor = new WeakMap<Event, boolean>()

const watchEditorEscape = (event: KeyboardEvent) => {
  const target = event.target
  if (!(target instanceof Element) || !target.closest(".monaco-editor")) return
  target.addEventListener(
    "keydown",
    (atTarget) => {
      if (atTarget === event)
        claimedBeforeEditor.set(event, event.defaultPrevented)
    },
    { capture: true, once: true },
  )
}

const onCapture = (event: KeyboardEvent) => {
  if (!isEscape(event)) return
  if (isTextFieldWithValue(event.target)) ownedByTextField.add(event)
  else watchEditorEscape(event)
}

const isClaimedForLayers = (event: KeyboardEvent) =>
  claimedBeforeEditor.get(event) ?? isEscapeClaimed(event)

const contains = (layer: EscapeLayer, target: EventTarget | null) => {
  const scope = layer.scope?.()
  return !!scope && target instanceof Node && scope.contains(target)
}

// Layers containing the target, innermost first, then the rest by priority.
// Ties go to the most recently registered layer.
const depth = (element: Element | null | undefined): number => {
  let count = 0
  for (let node = element; node; node = node.parentElement) count++
  return count
}

const dispatchOrder = (target: EventTarget | null): EscapeLayer[] => {
  const latestFirst = [...layers].reverse()
  // Scopes that contain the target are its ancestors: the deepest is the
  // innermost. The sort is stable, so equal depths keep the latest first.
  const scoped = latestFirst
    .filter((layer) => contains(layer, target))
    .map((layer) => ({ layer, depth: depth(layer.scope?.()) }))
    .sort((a, b) => b.depth - a.depth)
    .map(({ layer }) => layer)
  const rest = latestFirst
    .filter((layer) => !scoped.includes(layer))
    .sort((a, b) => b.priority - a.priority)
  return [...scoped, ...rest]
}

// A press a text field owns reaches no ambient layer.
const onBubble = (event: KeyboardEvent) => {
  if (
    !isEscape(event) ||
    isClaimedForLayers(event) ||
    ownedByTextField.has(event)
  )
    return
  for (const layer of dispatchOrder(event.target)) {
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
