import { afterEach, describe, expect, it, vi } from "vitest"
import type { EChartsType } from "echarts"
import { buildEchartsOption, type ResolvedQuery } from "./buildEchartsOption"
import { echarts } from "./echartsSetup"
import type { ChartConfig } from "./chartTypes"
import { resolveDraw } from "../DrawCanvas/drawCanvasUtils"
import { interactionEvents } from "../interactions/chartInteractions"

// An unbound click on preset charts selects the column the clicked mark is
// drawn from, with the click params ECharts builds for the clicked item.

const charts: EChartsType[] = []
afterEach(() => {
  charts.splice(0).forEach((chart) => chart.dispose())
})

type Result = {
  query: string
  columns: { name: string; type: string }[]
  dataset: unknown[][]
}

const clickItem = (
  option: ReturnType<typeof buildEchartsOption>,
  statements: Result[],
  dataIndex: number,
  column?: string,
) => {
  const chart = echarts.init(null, undefined, {
    renderer: "svg",
    ssr: true,
    width: 800,
    height: 500,
  })
  charts.push(chart)
  chart.setOption(option)
  const params = (
    chart as unknown as {
      getModel(): {
        getSeriesByIndex(i: number): {
          getDataParams(i: number): Record<string, unknown>
        }
      }
    }
  )
    .getModel()
    .getSeriesByIndex(0)
    .getDataParams(dataIndex)
  const setVariables = vi.fn()
  interactionEvents({ click: { variable: "pick", column } }, setVariables, () =>
    statements.map((s) => ({ columns: s.columns, rows: s.dataset })),
  ).click({ ...params, componentType: "series" }, chart)
  return setVariables
}

describe("unbound chart clicks", () => {
  // A NULL desk, as QuestDB sends it.
  const desks: Result = {
    query: "SELECT desk, bucket, volume FROM trades",
    columns: [
      { name: "desk", type: "SYMBOL" },
      { name: "bucket", type: "SYMBOL" },
      { name: "volume", type: "LONG" },
    ],
    dataset: [
      ["desk1", "b1", 10],
      [null, "b2", 20],
    ],
  }
  const drawn = (config: ChartConfig) => {
    const resolution = resolveDraw([desks.query], [desks] as never, config)
    return buildEchartsOption(resolution.chart, resolution.renderQueries, {
      clickEnabled: true,
    })
  }

  it.each([
    ["bar", { type: "bar", yColumns: ["volume"] }],
    ["pie", { type: "pie", yColumns: ["volume"] }],
    [
      "heatmap",
      {
        type: "heatmap",
        yColumns: [],
        heatmap: { y: "bucket", value: "volume" },
      },
    ],
  ] as const)(
    "selects NULL, not the drawn value, for a NULL %s category",
    (_type, query) => {
      const option = drawn({
        xColumn: "desk",
        queries: [query],
      } as unknown as ChartConfig)

      // When the user clicks the named category, then the NULL one
      const named = clickItem(option, [desks], 0)
      const missing = clickItem(option, [desks], 1)

      // Then the first selects its name and the second selects NULL
      expect(named).toHaveBeenCalledWith({ pick: "'desk1'" })
      expect(missing).toHaveBeenCalledWith({ pick: "null" })
    },
  )

  it("selects NULL for a 100% stack whose NULL category repeats in a series", () => {
    // Given a NULL desk that appears twice in the "buy" series
    const sides: Result = {
      query: "SELECT desk, side, volume FROM trades",
      columns: [
        { name: "desk", type: "SYMBOL" },
        { name: "side", type: "SYMBOL" },
        { name: "volume", type: "LONG" },
      ],
      dataset: [
        [null, "buy", 10],
        [null, "sell", 20],
        [null, "buy", 30],
        ["d1", "sell", 40],
        ["d1", "buy", 50],
      ],
    }
    const resolution = resolveDraw(
      [sides.query],
      [sides] as never,
      {
        xColumn: "desk",
        queries: [
          {
            type: "stackedBar",
            yColumns: ["volume"],
            partitionByColumn: "side",
            percentStack: true,
          },
        ],
      } as unknown as ChartConfig,
    )
    const option = buildEchartsOption(
      resolution.chart,
      resolution.renderQueries,
      { clickEnabled: true },
    )
    const categories = (option.xAxis as { data: unknown[] }).data
    const nullIndex = categories.indexOf("")
    expect(nullIndex).toBeGreaterThanOrEqual(0)

    // When the user clicks the NULL bar of the first series
    const set = clickItem(option, [sides], nullIndex)

    // Then the variable is NULL, not the bar's share
    expect(set).toHaveBeenCalledWith({ pick: "null" })

    // And a bound click writes what both of its rows agree on, else nothing
    expect(clickItem(option, [sides], nullIndex, "side")).toHaveBeenCalledWith({
      pick: "'buy'",
    })
    expect(
      clickItem(option, [sides], nullIndex, "volume"),
    ).not.toHaveBeenCalled()
  })

  it("selects the x of a time line point and of a scatter point", () => {
    // Given a time line and a scatter over the same rows
    const ticks: Result = {
      query: "SELECT ts, x, y FROM ticks",
      columns: [
        { name: "ts", type: "TIMESTAMP" },
        { name: "x", type: "DOUBLE" },
        { name: "y", type: "DOUBLE" },
      ],
      dataset: [
        ["2026-01-01T01:00:00.000000Z", 4, 10],
        ["2026-01-01T02:00:00.000000Z", 6, 12],
      ],
    }
    const draw = (config: ChartConfig) => {
      const resolution = resolveDraw([ticks.query], [ticks] as never, config)
      return buildEchartsOption(resolution.chart, resolution.renderQueries, {
        clickEnabled: true,
      })
    }
    const line = draw({
      xColumn: "ts",
      queries: [{ type: "line", yColumns: ["y"] }],
    } as unknown as ChartConfig)
    const scatter = draw({
      xColumn: "x",
      queries: [{ type: "scatter", yColumns: ["y"] }],
    } as unknown as ChartConfig)

    // When the user clicks the first point of each
    const time = clickItem(line, [ticks], 0)
    const value = clickItem(scatter, [ticks], 0)

    // Then the line selects its timestamp and the scatter its x
    expect(time).toHaveBeenCalledWith({ pick: "'2026-01-01T01:00:00.000000Z'" })
    expect(value).toHaveBeenCalledWith({ pick: "4" })
  })

  it("selects a box plot's timestamp, not its shortened axis label", () => {
    // Given a box plot over hours of one day, labelled "09:00", "10:00"
    const statement: Result = {
      query: "SELECT ts, a, b, c, d, e FROM latency",
      columns: [
        { name: "ts", type: "TIMESTAMP" },
        ...["a", "b", "c", "d", "e"].map((name) => ({ name, type: "DOUBLE" })),
      ],
      dataset: [
        ["2026-01-01T09:00:00.000000Z", 1, 2, 3, 4, 5],
        ["2026-01-01T10:00:00.000000Z", 2, 3, 4, 5, 6],
      ],
    }
    const option = buildEchartsOption(
      { xColumn: "ts" },
      [
        {
          index: 0,
          columns: statement.columns,
          dataset: statement.dataset,
          xColumn: "ts",
          type: "boxplot",
          yColumns: [],
          roles: { min: "a", q1: "b", median: "c", q3: "d", max: "e" },
        } as unknown as ResolvedQuery,
      ],
      { clickEnabled: true },
    )
    expect((option.xAxis as { data: unknown[] }).data).toEqual([
      "09:00",
      "10:00",
    ])

    // When the user clicks the second box
    const set = clickItem(option, [statement], 1)

    // Then the variable holds that bucket's timestamp
    expect(set).toHaveBeenCalledWith({
      pick: "'2026-01-01T10:00:00.000000Z'",
    })
  })
})
