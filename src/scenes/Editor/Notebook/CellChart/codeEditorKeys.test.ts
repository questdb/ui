// @vitest-environment jsdom
import { expect, it, vi } from "vitest"
import { tabPastCodeEditor } from "./codeEditorKeys"

it("hands Tab to the control in the frame's own panel only", () => {
  const upper = document.createElement("div")
  const lower = document.createElement("div")
  const editor = document.createElement("div")
  editor.dataset.hook = "code-editor-field"
  const next = document.createElement("button")
  upper.append(editor, next)
  lower.append(document.createElement("button"))
  document.body.append(upper, lower)
  const event = {
    key: "Tab",
    shiftKey: false,
    target: editor,
    preventDefault: vi.fn(),
  }
  try {
    expect(tabPastCodeEditor(event, upper)).toBe(true)
    expect(tabPastCodeEditor(event, lower)).toBe(false)
    expect(document.activeElement).toBe(next)
    expect(event.preventDefault).toHaveBeenCalledOnce()
  } finally {
    upper.remove()
    lower.remove()
  }
})
