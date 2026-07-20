import { afterEach, describe, expect, it } from "vitest"
import { clearChartZoom, getChartZoom, setChartZoom } from "./chartZoomStore"

describe("chartZoomStore", () => {
  afterEach(() => {
    clearChartZoom("c1")
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
})
