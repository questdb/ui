import React from "react"
import { act, create } from "react-test-renderer"
import { describe, expect, it, vi } from "vitest"
import { useNotebookOpenTelemetry } from "./useNotebookOpenTelemetry"
import { trackEvent } from "../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../modules/ConsoleEventTracker/events"

vi.mock("../modules/ConsoleEventTracker", () => ({ trackEvent: vi.fn() }))
const View = ({ id, ready }: { id: number; ready: boolean }) => {
  useNotebookOpenTelemetry(id, ready)
  return null
}

describe("notebook open telemetry", () => {
  it("counts loaded activations and returns, excluding loading, previews and rerenders", () => {
    vi.clearAllMocks()
    const renderer = create(<View id={1} ready={false} />)
    act(() => renderer.update(<View id={1} ready={false} />))
    expect(trackEvent).not.toHaveBeenCalled()
    act(() => renderer.update(<View id={1} ready />))
    act(() => renderer.update(<View id={1} ready />))
    expect(trackEvent).toHaveBeenCalledTimes(1)
    expect(trackEvent).toHaveBeenCalledWith(ConsoleEvent.NOTEBOOK_TAB_OPEN, {
      notebookId: 1,
      trigger: "activation",
    })
    act(() => renderer.update(<View id={2} ready />))
    act(() => renderer.update(<View id={1} ready />))
    expect(trackEvent).toHaveBeenCalledTimes(3)
    act(() => renderer.unmount())
    // A new page mount counts even when the last active notebook was restored.
    const reloaded = create(<View id={1} ready />)
    act(() => reloaded.update(<View id={1} ready />))
    expect(trackEvent).toHaveBeenCalledTimes(4)
    act(() => reloaded.unmount())
  })
  it("counts a return to the browser tab without requiring a notebook remount", () => {
    vi.clearAllMocks()
    const page = Object.assign(new EventTarget(), { hidden: true })
    vi.stubGlobal("document", page)
    let renderer: ReturnType<typeof create> | undefined
    try {
      act(() => {
        renderer = create(<View id={3} ready />)
      })
      expect(trackEvent).not.toHaveBeenCalled()
      act(() => {
        page.hidden = false
        page.dispatchEvent(new Event("visibilitychange"))
      })
      expect(trackEvent).toHaveBeenCalledWith(ConsoleEvent.NOTEBOOK_TAB_OPEN, {
        notebookId: 3,
        trigger: "visibility",
      })
      // Duplicate visible notifications are not new visits.
      act(() => {
        page.dispatchEvent(new Event("visibilitychange"))
      })
      expect(trackEvent).toHaveBeenCalledTimes(1)
      act(() => {
        page.hidden = true
        page.dispatchEvent(new Event("visibilitychange"))
      })
      act(() => {
        page.hidden = false
        page.dispatchEvent(new Event("visibilitychange"))
      })
      expect(trackEvent).toHaveBeenCalledTimes(2)
    } finally {
      act(() => renderer?.unmount())
      vi.unstubAllGlobals()
    }
  })
})
