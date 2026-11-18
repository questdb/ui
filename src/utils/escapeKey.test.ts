// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  EscapePriority,
  registerEscapeLayer,
  type EscapeLayer,
} from "./escapeKey"

const cleanups: Array<() => void> = []
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  document.body.innerHTML = ""
})

const layer = (
  name: string,
  calls: string[],
  options: Partial<EscapeLayer> & { acts?: boolean } = {},
) => {
  const { acts = true, ...rest } = options
  cleanups.push(
    registerEscapeLayer({
      priority: EscapePriority.sidePanel,
      onEscape: () => {
        calls.push(name)
        return acts
      },
      ...rest,
    }),
  )
}

const element = (tag = "div", parent: Element = document.body) => {
  const node = document.createElement(tag)
  parent.appendChild(node)
  return node
}

const press = (target: EventTarget = document.body, key = "Escape") => {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
  })
  target.dispatchEvent(event)
  return event
}

describe("ambient Escape layers", () => {
  it("lets the highest priority layer act, one layer per press", () => {
    const calls: string[] = []
    layer("cell", calls, { priority: EscapePriority.notebookCell })
    layer("panel", calls, { priority: EscapePriority.sidePanel })
    const event = press()
    expect(calls).toEqual(["cell"])
    expect(event.defaultPrevented).toBe(true)
  })

  it("prefers the layer that contains the focus", () => {
    const calls: string[] = []
    const panel = element()
    const action = element("button", panel)
    layer("cell", calls, { priority: EscapePriority.notebookCell })
    layer("panel", calls, { scope: () => panel })
    press(action)
    expect(calls).toEqual(["panel"])
  })

  it("prefers the innermost of nested layers", () => {
    const calls: string[] = []
    const outer = element()
    const inner = element("div", outer)
    layer("inner", calls, { scope: () => inner })
    layer("outer", calls, { scope: () => outer })
    press(element("button", inner))
    expect(calls).toEqual(["inner"])
  })

  it("moves on to the next layer when one has nothing to do", () => {
    const calls: string[] = []
    layer("panel", calls, { priority: EscapePriority.sidePanel })
    layer("idle", calls, { priority: EscapePriority.notebookCell, acts: false })
    press()
    expect(calls).toEqual(["idle", "panel"])
  })

  it("ignores an Escape that something else claimed", () => {
    const calls: string[] = []
    layer("panel", calls)
    const target = element()
    target.addEventListener("keydown", (event) => event.preventDefault())
    press(target)
    expect(calls).toEqual([])
  })

  it("leaves Escape to a text field that held text when it was pressed", () => {
    const calls: string[] = []
    layer("panel", calls)
    const input = element("input") as HTMLInputElement
    input.value = "trades"
    // The field clears itself without claiming the key.
    input.addEventListener("keydown", () => {
      input.value = ""
    })
    press(input)
    expect(calls).toEqual([])
    press(input)
    expect(calls).toEqual(["panel"])
  })

  it.each(["checkbox", "radio", "range", "button"])(
    "does not treat a %s input as a text field",
    (type) => {
      const calls: string[] = []
      layer("panel", calls)
      const input = element("input") as HTMLInputElement
      input.type = type
      input.value = input.value || "go"
      press(input)
      expect(calls).toEqual(["panel"])
    },
  )

  it("does not treat the editor's hidden input as a text field", () => {
    const calls: string[] = []
    layer("panel", calls)
    const editor = element()
    editor.className = "monaco-editor"
    const textarea = element("textarea", editor) as HTMLTextAreaElement
    textarea.value = "select 1"
    press(textarea)
    expect(calls).toEqual(["panel"])
  })

  it("ignores other keys and stops listening once every layer is gone", () => {
    const onEscape = vi.fn(() => true)
    const unregister = registerEscapeLayer({ priority: 1, onEscape })
    press(document.body, "Enter")
    expect(onEscape).not.toHaveBeenCalled()
    unregister()
    press()
    expect(onEscape).not.toHaveBeenCalled()
  })
})
