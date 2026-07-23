import { afterEach, describe, expect, it, vi } from "vitest"
import {
  clearChartZoom,
  getChartZoom,
  setChartZoom,
  subscribeChartZoom,
} from "./chartZoomStore"

describe("chartZoomStore", () => {
  afterEach(() => {
    clearChartZoom("c1")
    clearChartZoom("c2")
  })

  it("preserves a zoom window and clears it on a full-range zoom", () => {
    // Given a zoomed chart written through
    setChartZoom("c1", 20, 60)
    expect(getChartZoom("c1")).toEqual({ start: 20, end: 60 })

    // When the zoom resets to the full range
    setChartZoom("c1", 0, 100)

    // Then the stored window is gone
    expect(getChartZoom("c1")).toBeUndefined()
  })

  it("notifies only the changed cell's subscribers, until unsubscribed", () => {
    // Given subscribers on two cells
    const forC1 = vi.fn()
    const forC2 = vi.fn()
    const offC1 = subscribeChartZoom("c1", forC1)
    subscribeChartZoom("c2", forC2)()

    // When one cell zooms and then clears
    setChartZoom("c1", 20, 60)
    clearChartZoom("c1")

    // Then only its own live subscriber was notified, once per change
    expect(forC1).toHaveBeenCalledTimes(2)
    expect(forC2).not.toHaveBeenCalled()

    // And no notification lands after unsubscribing
    offC1()
    setChartZoom("c1", 10, 40)
    expect(forC1).toHaveBeenCalledTimes(2)
  })
})
