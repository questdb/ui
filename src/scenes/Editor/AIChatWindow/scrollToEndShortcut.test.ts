// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import {
  SCROLL_TO_END_KEYS,
  isCaretAtEndOfText,
  isScrollToEndShortcut,
} from "./scrollToEndShortcut"

const key = (init: KeyboardEventInit) => new KeyboardEvent("keydown", init)

const textarea = (value: string, caret: number) => {
  const element = document.createElement("textarea")
  element.value = value
  element.setSelectionRange(caret, caret)
  return element
}

describe("scroll to end shortcut (outside macOS)", () => {
  it("is Ctrl+End, without other modifiers", () => {
    // Then
    expect(SCROLL_TO_END_KEYS).toEqual(["Ctrl", "End"])
    expect(isScrollToEndShortcut(key({ key: "End", ctrlKey: true }))).toBe(true)
    expect(
      isScrollToEndShortcut(key({ key: "End", ctrlKey: true, shiftKey: true })),
    ).toBe(false)
    expect(isScrollToEndShortcut(key({ key: "End" }))).toBe(false)
    expect(
      isScrollToEndShortcut(key({ key: "ArrowDown", metaKey: true })),
    ).toBe(false)
  })

  it("leaves the keys to a text field until its caret is at the end", () => {
    // Then
    expect(isCaretAtEndOfText(textarea("Show trades", 4))).toBe(false)
    expect(isCaretAtEndOfText(textarea("Show trades", 11))).toBe(true)
    expect(isCaretAtEndOfText(textarea("", 0))).toBe(true)
    expect(isCaretAtEndOfText(document.body)).toBe(true)
  })
})
