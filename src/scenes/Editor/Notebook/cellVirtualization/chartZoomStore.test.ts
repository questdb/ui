import { afterEach, describe, expect, it, vi } from "vitest"
import { setChartSync } from "../interactions/chartSync"
import type { ZoomAxes, ZoomState } from "../CellChart/zoomWindow"
import {
  chartZoomState,
  chartZoomed,
  clearChartZoom,
  clearNotebookChartZooms,
  resetChartZoom,
  resetOwnChartZoom,
  setChartZoom,
  setChartZoomAxes,
  setLinkedZoom,
  subscribeChartZoom,
} from "./chartZoomStore"

const BUFFER = 71
const c1 = { bufferId: BUFFER, cellId: "c1" }
const c2 = { bufferId: BUFFER, cellId: "c2" }
const TIME: ZoomAxes = { time: true, axes: { x0: "time", y0: "value" } }
const pinned = (from: number, to: number): ZoomState => ({
  mode: "pinned",
  from,
  to,
  axis: "time",
})

describe("chartZoomStore", () => {
  afterEach(() => {
    clearNotebookChartZooms(BUFFER)
    setChartSync(BUFFER, undefined)
  })

  it("keeps each control's window, and a full-range zoom is not a zoom", () => {
    // Given a zoomed chart written through
    setChartZoomAxes(c1, TIME)
    setChartZoom(c1, "x0", pinned(20, 60))
    expect(chartZoomState(c1, "x0")).toEqual(pinned(20, 60))
    expect(chartZoomState(c1, "y0")).toEqual({ mode: "default" })
    expect(chartZoomed(c1)).toBe(true)

    // When the zoom goes out to the full range
    setChartZoom(c1, "x0", { mode: "full" })

    // Then the chart follows all its data and is not zoomed
    expect(chartZoomState(c1, "x0")).toEqual({ mode: "full" })
    expect(chartZoomed(c1)).toBe(false)
  })

  it("keeps a linked interval that currently covers every peer sample", () => {
    // Given a sparse time chart whose data the linked window covers
    setChartZoomAxes(c1, TIME)
    setLinkedZoom(BUFFER, pinned(40, 80))

    // Then it stays on those times, and is zoomed
    expect(chartZoomState(c1, "x0")).toEqual(pinned(40, 80))
    expect(chartZoomed(c1)).toBe(true)
  })

  it("shows the newer of a chart's own window and the linked one", () => {
    setChartZoomAxes(c1, TIME)
    setChartZoomAxes(c2, TIME)
    setChartZoom(c1, "x0", pinned(1, 2))
    setLinkedZoom(BUFFER, pinned(3, 4))
    expect(chartZoomState(c1, "x0")).toEqual(pinned(3, 4))
    expect(chartZoomState(c2, "x0")).toEqual(pinned(3, 4))
    // An SQL edit resets the edited chart alone, leaving the linked window
    resetChartZoom(c1, { localOnly: true })
    expect(chartZoomState(c1, "x0")).toEqual({ mode: "default" })
    expect(chartZoomState(c2, "x0")).toEqual(pinned(3, 4))
    // Only a time chart's first x axis takes the linked window
    expect(chartZoomState(c2, "y0")).toEqual({ mode: "default" })
    expect(
      chartZoomState(c2, "x0", { time: false, axes: { x0: "category" } }),
    ).toEqual({ mode: "default" })
  })

  it("resets linked peers on Reset zoom while charts zoom together", () => {
    setChartSync(BUFFER, { crosshair: "off", zoom: true })
    setChartZoomAxes(c1, TIME)
    setChartZoomAxes(c2, TIME)
    setLinkedZoom(BUFFER, pinned(3, 4))
    resetChartZoom(c1)
    expect(chartZoomState(c2, "x0")).toEqual({ mode: "default" })
  })

  it("drops a time window once its axis holds other units", () => {
    setChartZoomAxes(c1, TIME)
    setChartZoom(c1, "x0", pinned(1767225799800, 1767226399200))
    setChartZoomAxes(c1, { time: false, axes: { x0: "value" } })
    expect(chartZoomState(c1, "x0")).toEqual({ mode: "default" })
    expect(chartZoomed(c1)).toBe(false)
  })

  it("resets a chart's own windows but not a linked one when no control can move them", () => {
    setChartZoomAxes(c1, TIME)
    setChartZoom(c1, "y0", { mode: "pinned-pct", start: 10, end: 20 })
    setLinkedZoom(BUFFER, pinned(3, 4))
    resetOwnChartZoom(c1)
    expect(chartZoomState(c1, "y0")).toEqual({ mode: "default" })
    expect(chartZoomState(c1, "x0")).toEqual(pinned(3, 4))
  })

  it("notifies only the changed cell's subscribers, until unsubscribed", () => {
    // Given subscribers on two cells
    const forC1 = vi.fn()
    const forC2 = vi.fn()
    const offC1 = subscribeChartZoom(c1, forC1)
    subscribeChartZoom(c2, forC2)()

    // When one cell zooms and then is deleted
    setChartZoom(c1, "x0", pinned(20, 60))
    clearChartZoom(c1)

    // Then only its own live subscriber was notified, once per change
    expect(forC1).toHaveBeenCalledTimes(2)
    expect(forC2).not.toHaveBeenCalled()

    // And no notification lands after unsubscribing
    offC1()
    setChartZoom(c1, "x0", pinned(10, 40))
    expect(forC1).toHaveBeenCalledTimes(2)
  })
})
