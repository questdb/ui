// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"
import { cellShortcutOf, isCellShortcutHandledElsewhere } from "./cellShortcut"

const keydown = (init: KeyboardEventInit) =>
  new KeyboardEvent("keydown", { cancelable: true, ...init })

const mount = (html: string): HTMLElement => {
  document.body.innerHTML = html
  return document.querySelector<HTMLElement>("[data-target]") as HTMLElement
}

const selectTextOf = (element: HTMLElement) => {
  const range = document.createRange()
  range.selectNodeContents(element)
  window.getSelection()?.removeAllRanges()
  window.getSelection()?.addRange(range)
}

afterEach(() => {
  window.getSelection()?.removeAllRanges()
  document.body.innerHTML = ""
})

describe("cellShortcutOf", () => {
  it.each([
    ["Delete", { key: "Delete" }],
    ["Cmd+Backspace", { key: "Backspace", metaKey: true }],
  ])("reads %s as delete", (_, init) => {
    expect(cellShortcutOf(keydown(init))).toBe("delete")
  })

  it.each([
    ["Cmd+Z", { key: "z", metaKey: true }, "undo"],
    ["Cmd+Shift+Z", { key: "z", metaKey: true, shiftKey: true }, "redo"],
    ["Ctrl+Y", { key: "y", ctrlKey: true }, "redo"],
    ["Cmd+D", { key: "d", metaKey: true }, "duplicate"],
  ])("reads %s as %s", (_, init, shortcut) => {
    expect(cellShortcutOf(keydown(init))).toBe(shortcut)
  })

  it.each([
    ["no modifier", { key: "c" }],
    ["shift", { key: "c", metaKey: true, shiftKey: true }],
    ["alt", { key: "v", ctrlKey: true, altKey: true }],
    ["a held key", { key: "v", metaKey: true, repeat: true }],
    ["a plain Backspace", { key: "Backspace" }],
    [
      "Ctrl+Backspace, which deletes a word",
      { key: "Backspace", ctrlKey: true },
    ],
    ["a held Delete", { key: "Delete", repeat: true }],
    ["Cmd+Y, which is not redo on macOS", { key: "y", metaKey: true }],
  ])("ignores %s", (_, init) => {
    expect(cellShortcutOf(keydown(init))).toBeNull()
  })
})

describe("isCellShortcutHandledElsewhere", () => {
  it("leaves the key to the cell when the cell itself has focus", () => {
    // Given a focused cell wrapper and no text selection
    const cell = mount(`<div data-target tabindex="-1">chart</div>`)

    // When Cmd+C is checked
    const handled = isCellShortcutHandledElsewhere(
      keydown({ key: "c", metaKey: true }),
      "copy",
      cell,
      window.getSelection(),
    )

    // Then nothing else owns it
    expect(handled).toBe(false)
  })

  it.each([
    [
      "the Monaco editor",
      `<div class="monaco-editor"><textarea data-target></textarea></div>`,
    ],
    ["an input", `<input data-target />`],
    [
      "a result grid",
      `<div role="grid" tabindex="0"><span data-target></span></div>`,
    ],
    [
      "a content editable",
      `<div contenteditable="true"><span data-target></span></div>`,
    ],
  ])("leaves the key to %s", (_, html) => {
    // Given focus inside an element with native clipboard handling
    const target = mount(html)

    // When Cmd+V is checked
    const handled = isCellShortcutHandledElsewhere(
      keydown({ key: "v", metaKey: true }),
      "paste",
      target,
      window.getSelection(),
    )

    // Then the element owns it
    expect(handled).toBe(true)
  })

  it("leaves the key to a component that prevented it", () => {
    // Given a result grid that handled Cmd+C for its own cell
    const cell = mount(`<div data-target tabindex="-1"></div>`)
    const event = keydown({ key: "c", metaKey: true })
    event.preventDefault()

    // When the key is checked
    const handled = isCellShortcutHandledElsewhere(
      event,
      "copy",
      cell,
      window.getSelection(),
    )

    // Then the grid owns it
    expect(handled).toBe(true)
  })

  it("leaves copy to a text selection, but not paste", () => {
    // Given selected text in a rendered markdown cell
    const cell = mount(`<div data-target tabindex="-1">Some notes</div>`)
    selectTextOf(cell)

    // When copy and paste are checked
    const copyHandled = isCellShortcutHandledElsewhere(
      keydown({ key: "c", metaKey: true }),
      "copy",
      cell,
      window.getSelection(),
    )
    const pasteHandled = isCellShortcutHandledElsewhere(
      keydown({ key: "v", metaKey: true }),
      "paste",
      cell,
      window.getSelection(),
    )

    // Then the selection owns copy, and the cell still takes paste
    expect(copyHandled).toBe(true)
    expect(pasteHandled).toBe(false)
  })
})
