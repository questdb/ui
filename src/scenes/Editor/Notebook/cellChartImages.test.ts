// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import type { EChartsType } from "echarts"
import {
  backgroundOf,
  cellChartInstance,
  pictureOf,
  registerCellChart,
  waitForCellChart,
} from "./cellChartImages"

const chart = (width = 400, height = 300, data = "QUJD") => {
  const getDataURL = vi.fn(() => `data:image/png;base64,${data}`)
  return {
    instance: {
      isDisposed: () => false,
      getWidth: () => width,
      getHeight: () => height,
      getDataURL,
    } as unknown as EChartsType,
    getDataURL,
  }
}

describe("cell chart pictures", () => {
  it("knows each drawn cell's chart until it unmounts", () => {
    // Given
    const { instance } = chart()
    const unregister = registerCellChart(1, "c", instance)

    // When / Then
    expect(cellChartInstance(1, "c")).toBe(instance)
    expect(cellChartInstance(2, "c")).toBeNull()
    unregister()
    expect(cellChartInstance(1, "c")).toBeNull()
  })

  it("does not forget a newer chart when an older one unmounts", () => {
    // Given a remount: the new chart registers before the old one leaves
    const older = chart().instance
    const newer = chart().instance
    const leaveOlder = registerCellChart(1, "c", older)
    registerCellChart(1, "c", newer)

    // When
    leaveOlder()

    // Then
    expect(cellChartInstance(1, "c")).toBe(newer)
  })

  it("waits for a chart scrolled into view", async () => {
    // Given a chart that draws a moment later
    const { instance } = chart()
    setTimeout(() => registerCellChart(1, "late", instance), 150)

    // When / Then
    await expect(waitForCellChart(1, "late", 2000)).resolves.toBe(instance)
    await expect(waitForCellChart(1, "never", 150)).resolves.toBeNull()
  })

  it("keeps a tall chart's longest side at 1600 px", () => {
    // Given a tall chart
    const { instance } = chart(800, 3200)

    // When / Then
    expect(pictureOf(instance, "rgb(0, 0, 0)")).toMatchObject({
      width: 400,
      height: 1600,
    })
  })

  it("draws a picture too large to send again at half the size, else gives up", () => {
    // Given a chart whose first picture is over the limit
    const big = "A".repeat(3_000_004)
    const getDataURL = vi
      .fn()
      .mockReturnValueOnce(`data:image/png;base64,${big}`)
      .mockReturnValueOnce("data:image/png;base64,QUJD")
    const instance = {
      getWidth: () => 800,
      getHeight: () => 400,
      getDataURL,
    } as unknown as EChartsType

    // When
    const picture = pictureOf(instance, "rgb(0, 0, 0)")

    // Then
    expect(picture).toEqual({ data: "QUJD", width: 800, height: 400 })
    expect(getDataURL).toHaveBeenLastCalledWith(
      expect.objectContaining({ pixelRatio: 1 }),
    )
    expect(pictureOf(chart(800, 400, big).instance, "rgb(0, 0, 0)")).toBeNull()
  })

  it("draws the picture about 1600 px wide at most, on the cell's background", () => {
    // Given a wide chart
    const { instance, getDataURL } = chart(3200, 800)

    // When
    const picture = pictureOf(instance, "rgb(1, 2, 3)")

    // Then
    expect(getDataURL).toHaveBeenCalledWith({
      type: "png",
      pixelRatio: 0.5,
      backgroundColor: "rgb(1, 2, 3)",
    })
    expect(picture).toEqual({ data: "QUJD", width: 1600, height: 400 })
  })

  it("finds the first opaque background up the tree", () => {
    // Given a transparent node inside a coloured one
    const outer = document.createElement("div")
    outer.style.backgroundColor = "rgb(10, 20, 30)"
    const inner = document.createElement("div")
    outer.appendChild(inner)
    document.body.appendChild(outer)

    // When / Then
    expect(backgroundOf(inner)).toBe("rgb(10, 20, 30)")
  })
})
