import { describe, expect, it } from "vitest"
import { lightColors } from "../../../../theme"
import {
  gaugeOption,
  graphOption,
  stateTimelineOption,
  treemapOption,
} from "./visualOptions"
import { statTiles } from "./StatTiles"
import { bulletRows } from "./Bullets"
import type { StatementRows } from "./statementRows"

const rows = (
  columns: [string, string][],
  data: (string | number | boolean)[][],
): StatementRows => ({
  columns: columns.map(([name, type]) => ({ name, type })),
  rows: data,
})

const series = (option: unknown) =>
  (option as { series: Record<string, unknown>[] }).series

describe("stateTimelineOption", () => {
  const states = rows(
    [
      ["ts", "TIMESTAMP"],
      ["robot", "SYMBOL"],
      ["state", "SYMBOL"],
    ],
    [
      ["2026-01-01T00:00:00.000000Z", "R-10", "error"],
      ["2026-01-01T00:00:00.000000Z", "R-2", "charging"],
      ["2026-01-01T00:00:00.000000Z", "R-1", "picking"],
      ["2026-01-01T01:00:00.000000Z", "R-1", "moving"],
    ],
  )

  it("escapes lane and state names in its tooltip", () => {
    // Given a lane named with markup, as any writer could ingest
    const ctx = {
      visual: { type: "stateTimeline" as const },
      statements: [
        rows(
          [
            ["ts", "TIMESTAMP"],
            ["robot", "SYMBOL"],
            ["state", "SYMBOL"],
          ],
          [["2026-01-01T00:00:00.000000Z", "<img src=x>", "<b>up"]],
        ),
      ],
      colors: lightColors,
      formats: {},
    }

    // When
    const { option } = stateTimelineOption(ctx)
    const formatter = (
      option as { tooltip: { formatter: (p: unknown) => string } }
    ).tooltip.formatter
    const html = formatter({ value: [0, 60000, 0, 0] })

    // Then
    expect(html).not.toContain("<img")
    expect(html).toContain("&lt;img src=x&gt;")
    expect(html).toContain("&lt;b&gt;up")
  })

  it("orders lanes naturally and states by severity, coloured by meaning", () => {
    // Given
    const ctx = {
      visual: { type: "stateTimeline" as const },
      statements: [states],
      colors: lightColors,
      formats: {},
    }

    // When
    const { option } = stateTimelineOption(ctx)

    // Then
    const yAxis = (option as { yAxis: { data: string[] } }).yAxis
    expect(yAxis.data).toEqual(["R-1", "R-2", "R-10"])
    const names = series(option).map((s) => s.name)
    expect(names).toEqual(["moving", "picking", "charging", "error"])
    const colorOf = (name: string) =>
      (
        series(option).find((s) => s.name === name) as {
          itemStyle: { color: string }
        }
      ).itemStyle.color
    expect(colorOf("moving")).toBe(lightColors.chartUp)
    expect(colorOf("charging")).toBe(lightColors.statusWarning)
    expect(colorOf("error")).toBe(lightColors.chartDown)
  })
})

describe("gaugeOption", () => {
  it("reports NULL as missing while keeping a genuine zero", () => {
    const build = (value: number | null) =>
      gaugeOption({
        visual: { type: "gauge" },
        statements: [
          { columns: [{ name: "value", type: "DOUBLE" }], rows: [[value]] },
        ],
        colors: lightColors,
        formats: {},
      })
    expect(build(null).option).toBeNull()
    expect(build(null).problems[0]?.message).toContain("No numeric value")
    expect(build(0).drawn.value).toBe(0)
  })

  it("shows the value large and only the scale ends as labels", () => {
    // Given
    const memory = rows([["bytes", "LONG"]], [[300]])

    // When
    const { option } = gaugeOption({
      visual: { type: "gauge", min: 0, max: 1000 },
      statements: [memory],
      colors: lightColors,
      formats: {},
    })

    // Then
    const progress = series(option).find(
      (s) => (s.progress as { show?: boolean } | undefined)?.show,
    ) as { data: { value: number }[]; detail: { fontSize: number } }
    expect(progress.data[0].value).toBe(300)
    expect(progress.detail.fontSize).toBeGreaterThanOrEqual(24)
  })
})

describe("statTiles", () => {
  it("reads a caption column under each value", () => {
    // Given
    const summary = rows(
      [
        ["label", "STRING"],
        ["value", "LONG"],
        ["caption", "STRING"],
      ],
      [["Tables", 256, "254 use WAL"]],
    )

    // When
    const { tiles } = statTiles(
      { type: "stat", columns: { caption: "caption" } },
      [summary],
    )

    // Then
    expect(tiles[0]).toMatchObject({ label: "Tables", caption: "254 use WAL" })
  })
})

describe("bulletRows", () => {
  it("finds the target in a column named limit when none is given", () => {
    // Given
    const desks = rows(
      [
        ["desk", "SYMBOL"],
        ["var", "DOUBLE"],
        ["limit", "DOUBLE"],
      ],
      [["Spot", 40, 50]],
    )

    // When
    const read = bulletRows({ type: "bullet" }, desks)

    // Then
    expect(read).toMatchObject({ valueIdx: 1, targetIdx: 2, labelIdx: 0 })
  })
})

describe("visual tooltips", () => {
  it("escape formatted values, whose prefix and suffix come from formats", () => {
    // Given formats whose affixes are markup, as an import could carry
    const formats = {
      size: { prefix: "<img src=x ", suffix: " onerror=a>" },
      w: { prefix: "<b>" },
    }
    const tree = treemapOption({
      visual: { type: "treemap" as const },
      statements: [
        rows(
          [
            ["name", "SYMBOL"],
            ["size", "DOUBLE"],
          ],
          [["a", 1]],
        ),
      ],
      colors: lightColors,
      formats,
    })
    const graph = graphOption({
      visual: { type: "graph" as const },
      statements: [
        rows(
          [
            ["src", "SYMBOL"],
            ["dst", "SYMBOL"],
            ["w", "DOUBLE"],
          ],
          [["a", "b", 2]],
        ),
      ],
      colors: lightColors,
      formats,
    })
    const tooltip = (option: unknown) =>
      (option as { tooltip: { formatter: (p: unknown) => string } }).tooltip
        .formatter

    // When
    const treeHtml = tooltip(tree.option)({ name: "a", value: 1 })
    const edgeHtml = tooltip(graph.option)({
      dataType: "edge",
      data: { source: "a", target: "b", value: 2 },
    })

    // Then
    expect(treeHtml).not.toContain("<img")
    expect(treeHtml).toContain("&lt;img src=x")
    expect(edgeHtml).not.toContain("<b>2")
  })
})
