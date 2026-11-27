// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest"
import { redirectNextPaste } from "./systemClipboard"

const SINK_SELECTOR = "[data-clipboard-paste-sink]"

const pasteEvent = (data: Record<string, string>): Event => {
  const event = new Event("paste", { bubbles: true, cancelable: true })
  Object.defineProperty(event, "clipboardData", {
    value: { getData: (type: string) => data[type] ?? "" },
  })
  return event
}

const focusedCell = (): HTMLElement => {
  const cell = document.createElement("div")
  cell.tabIndex = -1
  document.body.appendChild(cell)
  cell.focus()
  return cell
}

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ""
})

describe("redirectNextPaste", () => {
  it("hands the pasted data over and gives focus back to the cell", () => {
    // Given a focused cell and a redirected paste
    const cell = focusedCell()
    const onPaste = vi.fn<[DataTransfer], void>()
    redirectNextPaste(onPaste)

    // When the browser pastes into the sink
    const sink = document.querySelector(SINK_SELECTOR) as HTMLElement
    const event = pasteEvent({ "text/plain": "SELECT 1" })
    sink.dispatchEvent(event)

    // Then the data arrives, the sink is gone, and the cell has focus again
    expect(onPaste.mock.calls[0][0].getData("text/plain")).toBe("SELECT 1")
    expect(event.defaultPrevented).toBe(true)
    expect(document.querySelector(SINK_SELECTOR)).toBeNull()
    expect(document.activeElement).toBe(cell)
  })

  it("gives focus back when no paste arrives", () => {
    // Given a redirected paste for an empty clipboard
    vi.useFakeTimers()
    const cell = focusedCell()
    const onPaste = vi.fn()
    redirectNextPaste(onPaste)

    // When no paste event fires
    vi.runAllTimers()

    // Then the sink is gone and the cell has focus again
    expect(onPaste).not.toHaveBeenCalled()
    expect(document.querySelector(SINK_SELECTOR)).toBeNull()
    expect(document.activeElement).toBe(cell)
  })
})
