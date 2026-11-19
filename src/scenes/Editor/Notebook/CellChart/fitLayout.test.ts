import { describe, expect, it } from "vitest"
import { CHART_PADDING, fitLayout } from "./fitLayout"

type Box = Record<string, unknown>
const SIZE = { width: 400, height: 300 }
const first = (value: unknown): Box =>
  (Array.isArray(value) ? value[0] : value) as Box

describe("fitLayout", () => {
  it("fits a grid to the panel and keeps its labels inside, whatever paddings it had", () => {
    // Given an option with paddings that would clip or waste space
    const option = {
      grid: { left: 2, right: "40%", top: 90, bottom: 0, containLabel: true },
      xAxis: { type: "time" },
      yAxis: { type: "value", name: "ms" },
    }

    // When
    const fitted = fitLayout<object>(option, SIZE) as { grid: unknown }

    // Then
    expect(first(fitted.grid)).toEqual({
      left: CHART_PADDING.left,
      right: CHART_PADDING.right,
      top: CHART_PADDING.top,
      bottom: CHART_PADDING.bottom,
      outerBoundsMode: "same",
      outerBoundsContain: "all",
    })
  })

  it("adds a grid when axes have none, and keeps clear of a bottom legend", () => {
    // Given
    const option = { legend: { top: 0, right: 0 }, xAxis: {}, yAxis: {} }

    // When
    const fitted = fitLayout<object>(option, SIZE) as {
      grid: unknown
      legend: unknown
    }

    // Then
    expect(first(fitted.legend)).toMatchObject({ left: "center", bottom: 3 })
    expect(first(fitted.legend).top).toBeUndefined()
    expect(first(fitted.grid).bottom).toBeGreaterThan(28)
  })

  it("keeps two stacked grids stacked in the same proportions", () => {
    // Given a price grid over a volume grid
    const option = {
      grid: [
        { left: 60, right: 20, top: 20, height: "60%" },
        { left: 60, right: 20, top: "75%", height: "15%" },
      ],
    }

    // When
    const fitted = fitLayout<object>(option, SIZE) as { grid: Box[] }

    // Then the first ends above where the second starts, both span the width
    const [price, volume] = fitted.grid
    expect(SIZE.height - (price.bottom as number)).toBeLessThan(
      volume.top as number,
    )
    expect(price.left).toBe(CHART_PADDING.left)
    expect(volume.right).toBe(CHART_PADDING.right)
  })

  it("centres a donut, sizes it to the panel and moves its centre label with it", () => {
    // Given a small donut pushed to the left with a total over it
    const option = {
      title: { text: "123", left: "20%", top: "45%" },
      series: [
        {
          type: "pie",
          center: ["20%", "50%"],
          radius: ["30%", "40%"],
          label: { show: false },
        },
      ],
    }

    // When
    const fitted = fitLayout<object>(option, SIZE) as {
      series: Box[]
      title: Box[]
    }

    // Then
    const pie = fitted.series[0]
    const [cx, cy] = pie.center as number[]
    const [, r] = pie.radius as number[]
    expect(cx).toBe(SIZE.width / 2)
    expect(r * 2).toBeCloseTo(
      SIZE.height - CHART_PADDING.top - CHART_PADDING.bottom,
      -1,
    )
    expect(fitted.title[0].left).toBe(cx)
    expect(Math.abs((fitted.title[0].top as number) - cy)).toBeLessThan(20)
  })

  it("uses the panel's height for a half donut", () => {
    // Given the top half of a donut
    const option = {
      series: [
        {
          type: "pie",
          startAngle: 180,
          endAngle: 360,
          radius: ["50%", "70%"],
          label: { show: false },
        },
      ],
    }

    // When
    const fitted = fitLayout<object>(option, SIZE) as { series: Box[] }

    // Then it is as wide as the panel allows, larger than a full circle fits
    const [, r] = fitted.series[0].radius as number[]
    const fullCircle =
      (SIZE.height - CHART_PADDING.top - CHART_PADDING.bottom) / 2
    expect(r).toBeGreaterThan(fullCircle * 1.2)
    expect(r * 2).toBeLessThanOrEqual(
      SIZE.width - CHART_PADDING.left - CHART_PADDING.right,
    )
  })

  it("leaves room for tree labels on both sides", () => {
    // Given
    const option = {
      series: [
        {
          type: "tree",
          left: 0,
          right: 0,
          data: [{ name: "root", children: [{ name: "a long leaf label" }] }],
        },
      ],
    }

    // When
    const fitted = fitLayout<object>(option, SIZE) as { series: Box[] }

    // Then
    const tree = fitted.series[0]
    expect(tree.left).toBeGreaterThan(CHART_PADDING.left + 20)
    expect(tree.right).toBeGreaterThan(CHART_PADDING.right + 90)
  })

  it("gives a calendar square cells that fit", () => {
    // Given 13 weeks
    const option = {
      calendar: { range: ["2026-01-01", "2026-03-31"], cellSize: ["auto", 40] },
    }

    // When
    const fitted = fitLayout<object>(option, SIZE) as { calendar: unknown }

    // Then
    const [w, h] = first(fitted.calendar).cellSize as number[]
    expect(w).toBe(h)
    expect(w * 7).toBeLessThanOrEqual(SIZE.height)
  })
})
