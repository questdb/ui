import { describe, expect, it } from "vitest"
import { buildCustomOption } from "./buildCustomOption"
import type { StatementRows } from "../visuals/statementRows"

const rows = (
  columns: [string, string][],
  data: (string | number)[][],
): StatementRows => ({
  columns: columns.map(([name, type]) => ({ name, type })),
  rows: data,
})

describe("buildCustomOption", () => {
  it("keeps tooltips on the chart renderer after binding and in nested options", () => {
    const { option } = buildCustomOption(
      {
        tooltip: { trigger: "axis" },
        series: [{ type: "bar", tooltip: { formatter: "Series {b}" } }],
        media: [{ option: { tooltip: "Media {b}" } }],
      },
      [],
      false,
    )
    expect(option).toMatchObject({
      tooltip: { trigger: "axis", renderMode: "richText", confine: true },
      series: [
        { tooltip: { formatter: "Series {b}", renderMode: "richText" } },
      ],
      media: [
        {
          option: {
            tooltip: { formatter: "Media {b}", renderMode: "richText" },
          },
        },
      ],
    })
  })

  it("puts each statement first as a dataset q<i>", () => {
    // Given
    const trades = rows(
      [
        ["ts", "TIMESTAMP"],
        ["price", "DOUBLE"],
      ],
      [["2026-01-01T00:00:00.000000Z", 1]],
    )

    // When
    const { option } = buildCustomOption(
      {
        dataset: [{ id: "f", fromDatasetId: "q0" }],
        series: [
          { type: "line", datasetId: "q0", encode: { x: "ts", y: "price" } },
        ],
      },
      [trades],
      false,
    )

    // Then
    const datasets = option.dataset as { id: string }[]
    expect(datasets.map((d) => d.id)).toEqual(["q0", "f"])
    expect(datasets[0]).toMatchObject({
      dimensions: [
        { name: "ts", type: "time" },
        { name: "price", type: "float" },
      ],
    })
  })

  it("reports encode columns missing from the dataset", () => {
    // Given
    const trades = rows([["price", "DOUBLE"]], [[1]])

    // When
    const { problems } = buildCustomOption(
      { series: [{ type: "line", datasetId: "q0", encode: { y: "qty" } }] },
      [trades],
      false,
    )

    // Then
    expect(problems[0].message).toContain('"qty"')
  })

  it("fills $rows placeholders in the shape a series needs", () => {
    // Given
    const flows = rows(
      [
        ["src", "SYMBOL"],
        ["dst", "SYMBOL"],
        ["mw", "DOUBLE"],
      ],
      [
        ["Solar", "Grid", 10],
        ["Grid", "Homes", 8],
      ],
    )

    // When
    const { option } = buildCustomOption(
      {
        series: [
          {
            type: "sankey",
            data: { $rows: { shape: "nodes" } },
            links: { $rows: { shape: "links", value: "mw" } },
          },
        ],
      },
      [flows],
      true,
    )

    // Then
    const [sankey] = option.series as { data: unknown; links: unknown }[]
    expect(sankey.data).toEqual([
      { name: "Solar" },
      { name: "Grid" },
      { name: "Homes" },
    ])
    expect(sankey.links).toEqual([
      { source: "Solar", target: "Grid", value: 10 },
      { source: "Grid", target: "Homes", value: 8 },
    ])
    expect(option.animation).toBe(false)
  })

  it("builds a tree from path columns", () => {
    // Given
    const caps = rows(
      [
        ["sector", "SYMBOL"],
        ["sym", "SYMBOL"],
        ["cap", "DOUBLE"],
      ],
      [
        ["Tech", "A", 2],
        ["Tech", "B", 3],
        ["Energy", "C", 5],
      ],
    )

    // When
    const { option } = buildCustomOption(
      {
        series: [
          {
            type: "treemap",
            data: {
              $rows: { shape: "tree", path: ["sector", "sym"], value: "cap" },
            },
          },
        ],
      },
      [caps],
      false,
    )

    // Then
    const [treemap] = option.series as { data: unknown }[]
    expect(treemap.data).toEqual([
      {
        name: "Tech",
        value: 5,
        children: [
          { name: "A", value: 2 },
          { name: "B", value: 3 },
        ],
      },
      { name: "Energy", value: 5, children: [{ name: "C", value: 5 }] },
    ])
  })

  it("shapes routes for a lines series", () => {
    // Given
    const routes = rows(
      [
        ["route", "STRING"],
        ["lon1", "DOUBLE"],
        ["lat1", "DOUBLE"],
        ["lon2", "DOUBLE"],
        ["lat2", "DOUBLE"],
        ["flights", "LONG"],
      ],
      [["LHR-JFK", -0.45, 51.47, -73.78, 40.64, 42]],
    )

    // When
    const { option } = buildCustomOption(
      {
        series: [
          {
            type: "lines",
            data: {
              $rows: {
                shape: "lines",
                columns: ["lon1", "lat1", "lon2", "lat2"],
                name: "route",
                value: "flights",
              },
            },
          },
        ],
      },
      [routes],
      false,
    )

    // Then
    const series = option.series as { data: unknown[] }[]
    expect(series[0].data).toEqual([
      {
        name: "LHR-JFK",
        coords: [
          [-0.45, 51.47],
          [-73.78, 40.64],
        ],
        value: 42,
      },
    ])
  })

  it("turns LONG strings into numbers in tuples", () => {
    // Given LONG values as the HTTP client returns them
    const counts = rows(
      [
        ["hour", "LONG"],
        ["day", "SYMBOL"],
      ],
      [["7", "Mon"]],
    )

    // When
    const { option } = buildCustomOption(
      { series: [{ type: "heatmap", data: { $rows: { shape: "tuples" } } }] },
      [counts],
      false,
    )

    // Then
    const series = option.series as { data: unknown[] }[]
    expect(series[0].data).toEqual([[7, "Mon"]])
  })

  it("drops float noise from numbers in datasets", () => {
    // Given a rounded double as QuestDB returns it
    const latency = rows([["ms", "DOUBLE"]], [[4.1000000000000005]])

    // When
    const { option } = buildCustomOption({}, [latency], false)

    // Then
    const [q0] = option.dataset as { source: unknown[][] }[]
    expect(q0.source).toEqual([[4.1]])
  })
})
