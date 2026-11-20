import { platform } from "../../../utils/platform"

// Scrolling the chat to its end uses the system's own "go to end" keys:
// Cmd+Down on macOS, Ctrl+End elsewhere.
const isApple = platform.isMacintosh || platform.isIOS

export const SCROLL_TO_END_KEYS: string[] = isApple
  ? ["⌘", "↓"]
  : ["Ctrl", "End"]

export const SCROLL_TO_END_LABEL = isApple ? "Cmd+Down" : "Ctrl+End"

export const isScrollToEndShortcut = (event: KeyboardEvent): boolean =>
  !event.shiftKey &&
  !event.altKey &&
  (isApple
    ? event.metaKey && !event.ctrlKey && event.key === "ArrowDown"
    : event.ctrlKey && !event.metaKey && event.key === "End")

// In a text field the same keys move the caret to the end of the text. They
// scroll the chat only once there is nothing left to move.
export const isCaretAtEndOfText = (target: EventTarget | null): boolean => {
  if (
    !(target instanceof HTMLTextAreaElement) &&
    !(target instanceof HTMLInputElement)
  ) {
    return true
  }
  const end = target.value.length
  return target.selectionStart === end && target.selectionEnd === end
}
