import { platform } from "../../../../utils/platform"

export type CellShortcut =
  | "copy"
  | "cut"
  | "paste"
  | "duplicate"
  | "delete"
  | "undo"
  | "redo"

// Cmd/Ctrl + key. D also bookmarks the page in browsers; handling the key
// stops that, as the result grid does for Cmd/Ctrl+B.
const SHORTCUT_BY_KEY: Record<string, CellShortcut> = {
  c: "copy",
  x: "cut",
  v: "paste",
  d: "duplicate",
}

const isApple = platform.isMacintosh || platform.isIOS

// macOS writes key symbols side by side (⌘C); Windows and Linux join key
// names with "+" (Ctrl+C).
const withCtrlCmd = (key: string) => (isApple ? `⌘${key}` : `Ctrl+${key}`)

export const CELL_SHORTCUT_LABELS: Record<CellShortcut, string> = {
  copy: withCtrlCmd("C"),
  cut: withCtrlCmd("X"),
  paste: withCtrlCmd("V"),
  duplicate: withCtrlCmd("D"),
  delete: isApple ? "⌘⌫" : "Del",
  undo: withCtrlCmd("Z"),
  redo: isApple ? "⌘⇧Z" : "Ctrl+Y",
}

// A text selection owns these keys: the browser copies or cuts the text, and
// a delete must not take the cell the text is in.
const SELECTION_SHORTCUTS: CellShortcut[] = ["copy", "cut", "delete"]

// A focused result grid owns the keys even with no value selected: moving
// focus out of it for a paste would drop its selection.
const SHORTCUT_OWNER_SELECTOR = [
  "input",
  "textarea",
  "select",
  "[contenteditable]:not([contenteditable='false'])",
  ".monaco-editor",
  "[role='grid']",
].join(", ")

// The Delete key works on every platform, so also fn+⌫ or ⌦ on macOS, and so
// does Meta+Backspace (⌘⌫), as most Mac keyboards have no Delete key. The
// labels show the key every keyboard of the platform has: ⌘⌫ or Del.
const isDeleteShortcut = (event: KeyboardEvent): boolean => {
  if (event.altKey || event.shiftKey || event.ctrlKey) return false
  return event.metaKey ? event.key === "Backspace" : event.key === "Delete"
}

// ⌘⇧Z redoes everywhere; Ctrl+Y also does on Windows and Linux.
const historyShortcutOf = (event: KeyboardEvent): CellShortcut | null => {
  const key = event.key.toLowerCase()
  if (key === "z") return event.shiftKey ? "redo" : "undo"
  if (key === "y" && event.ctrlKey && !event.metaKey && !event.shiftKey) {
    return "redo"
  }
  return null
}

export const cellShortcutOf = (event: KeyboardEvent): CellShortcut | null => {
  if (event.repeat) return null
  if (isDeleteShortcut(event)) return "delete"
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return null
  const historyShortcut = historyShortcutOf(event)
  if (historyShortcut) return historyShortcut
  if (event.shiftKey) return null
  return SHORTCUT_BY_KEY[event.key.toLowerCase()] ?? null
}

// A cell's settings drawer is a modal for that cell only: it takes the keys
// of the cell it covers, while the rest of the notebook stays in use.
export const hasOpenModalIn = (scope: Element | null): boolean =>
  scope?.querySelector("[aria-modal='true']") != null

const hasTextSelection = (selection: Selection | null): boolean =>
  selection !== null && !selection.isCollapsed && selection.toString() !== ""

// Native work (text fields, Monaco, a text selection) never calls
// preventDefault on the key, so it is detected from the focus and selection.
export const isCellShortcutHandledElsewhere = (
  event: KeyboardEvent,
  shortcut: CellShortcut,
  activeElement: Element | null,
  selection: Selection | null,
): boolean =>
  event.defaultPrevented ||
  activeElement?.closest(SHORTCUT_OWNER_SELECTOR) != null ||
  (SELECTION_SHORTCUTS.includes(shortcut) && hasTextSelection(selection))

// The keydown as a cell shortcut, unless the focused element or a text
// selection owns the key. Both the notebook and an open cell menu read keys
// this way.
export const unhandledCellShortcutOf = (
  event: KeyboardEvent,
): CellShortcut | null => {
  const shortcut = cellShortcutOf(event)
  if (
    !shortcut ||
    isCellShortcutHandledElsewhere(
      event,
      shortcut,
      document.activeElement,
      window.getSelection(),
    )
  ) {
    return null
  }
  return shortcut
}

// The shortcuts that act on one cell; useCellEditActions runs them.
export type CellActionShortcut = Extract<
  CellShortcut,
  "copy" | "cut" | "duplicate" | "delete"
>

export const isCellActionShortcut = (
  shortcut: CellShortcut,
): shortcut is CellActionShortcut =>
  shortcut === "copy" ||
  shortcut === "cut" ||
  shortcut === "duplicate" ||
  shortcut === "delete"
