// @vitest-environment jsdom
import React from "react"
import { fireEvent } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { EChartsOption, EChartsType } from "echarts"
import { lightColors } from "../../../../theme"
import { renderComponent } from "../../../../test/component"
import {
  CHART_TYPES,
  VISUAL_TYPES,
  type ChartType,
  type VisualConfig,
  type VisualType,
} from "../CellChart/chartTypes"
import {
  buildEchartsOption,
  type ResolvedQuery,
} from "../CellChart/buildEchartsOption"
import { echarts } from "../CellChart/echartsSetup"
import {
  chordOption,
  footprintOption,
  gaugeOption,
  graphOption,
  liquidityHeatmapOption,
  mapOption,
  sankeyOption,
  stateTimelineOption,
  sunburstOption,
  treemapOption,
  volumeProfileOption,
  type VisualContext,
} from "../visuals/visualOptions"
import { StatTiles } from "../visuals/StatTiles"
import { OrderBook } from "../visuals/OrderBook"
import { UptimeBars } from "../visuals/UptimeBars"
import { readStateSegments } from "../visuals/stateSegments"
import { toLabel, toTime, type StatementRows } from "../visuals/statementRows"
import {
  buildCustomOption,
  datasetPick,
} from "../customChart/buildCustomOption"
import { interactionEvents } from "./chartInteractions"
import { pickLiteral, sqlLiteral, type Pick as MarkPick } from "./selection"

// jsdom has no canvas; ECharts measures text without one.
vi.hoisted(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value: () => null,
  })
})

// The selection contract: a click writes the value of column X in the rows
// the clicked mark was drawn from, where X is the bound column, else the
// column the mark is drawn from. Every clickable mark of every chart type,
// visual and custom shape is checked against rows the test reads off the
// mark itself, so a builder that forgets a mark's rows, or names the wrong
// ones, fails here.

// Rows as QuestDB sends them: a NULL lane, LONG ids past 2^53 and DECIMAL
// prices as text, timestamps as ISO text. `v` tells the rows apart.
const at = (hour: number) => `2026-01-01T0${hour}:00:00.000000Z`
const fixture: StatementRows = {
  columns: [
    { name: "ts", type: "TIMESTAMP" },
    { name: "lane", type: "SYMBOL" },
    { name: "dst", type: "SYMBOL" },
    { name: "state", type: "SYMBOL" },
    { name: "id", type: "LONG" },
    { name: "px", type: "DECIMAL(10,2)" },
    { name: "v", type: "DOUBLE" },
    { name: "w", type: "DOUBLE" },
    { name: "lat", type: "DOUBLE" },
    { name: "lon", type: "DOUBLE" },
  ],
  rows: [
    [at(0), "a", "x", "up", "9007199254740993", "1.50", 1, 11, 10, 20],
    [at(1), null, "y", "down", "9007199254740995", "2.25", 2, 12, 11, 21],
    [at(2), "b", "x", "up", "9007199254740997", "3.00", 3, 13, 12, 22],
    [at(3), "a", "z", "up", "9007199254740999", "4.75", 4, 14, 13, 23],
  ],
}
const col = (name: string) => fixture.columns.findIndex((c) => c.name === name)
const V = col("v")

// The fixture without its coordinates, for a map of regions.
const withoutGeo: StatementRows = {
  columns: fixture.columns.filter((c) => c.name !== "lat" && c.name !== "lon"),
  rows: fixture.rows.map((row) => row.slice(0, col("lat"))),
}

/** Rows (by index) of a statement that match. */
const rowsWhere = (
  statement: StatementRows,
  match: (row: StatementRows["rows"][number]) => boolean,
): number[] => statement.rows.flatMap((row, i) => (match(row) ? [i] : []))

const rowsWithV = (v: unknown) => rowsWhere(fixture, (row) => row[V] === v)

// A clickable mark: what ECharts gives a click on it, and the rows the test
// reads off it, with the column it is drawn from (none for an edge).
type Mark = {
  params: Record<string, unknown>
  statement?: number
  rows: number[]
  drawn?: string
}

type Case = {
  statements: StatementRows[]
  marks: () => Mark[]
}

const NOT_CLICKABLE = "not clickable"

// ── Reading marks off an option ───────────────────────────────────────────

type SeriesItem = { series: Record<string, unknown>; item: unknown }

/** Every item a click can land on: series data (tree nodes too) and links. */
const itemsOf = (option: unknown): SeriesItem[] => {
  const list = (option as { series?: unknown }).series
  const series = (Array.isArray(list) ? list : list ? [list] : []) as Record<
    string,
    unknown
  >[]
  const out: SeriesItem[] = []
  const walk = (s: Record<string, unknown>, items: unknown) => {
    if (!Array.isArray(items)) return
    for (const item of items) {
      out.push({ series: s, item })
      const children = (item as { children?: unknown } | null)?.children
      if (children) walk(s, children)
    }
  }
  for (const s of series) {
    // A silent series takes no clicks.
    if (s.silent === true) continue
    walk(s, s.data)
    walk(s, s.links ?? s.edges)
  }
  return out
}

const valueOf = (item: unknown): unknown =>
  typeof item === "object" && item !== null && !Array.isArray(item)
    ? (item as { value?: unknown }).value
    : item

const isLink = (s: Record<string, unknown>, item: unknown) =>
  Array.isArray(s.links ?? s.edges) &&
  ((s.links ?? s.edges) as unknown[]).includes(item)

// ── Preset charts ─────────────────────────────────────────────────────────

const preset = (over: Partial<ResolvedQuery>): ResolvedQuery => ({
  index: 0,
  columns: fixture.columns,
  dataset: fixture.rows,
  xColumn: "lane",
  type: "line",
  yColumns: ["v"],
  axis: "left",
  ...over,
})

const presetCase = (
  over: Partial<ResolvedQuery>,
  rowsOf: (item: unknown, series: Record<string, unknown>) => number[],
  drawn = "lane",
): Case => ({
  statements: [fixture],
  marks: () =>
    itemsOf(
      buildEchartsOption({ xColumn: over.xColumn ?? "lane" }, [preset(over)], {
        clickEnabled: true,
      }),
    ).map(({ series, item }) => ({
      params: { data: item },
      rows: rowsOf(item, series),
      drawn,
    })),
})

// A point shows its row's v: alone in category mode, else as its y.
const byY = (item: unknown) => {
  const value = valueOf(item)
  return rowsWithV(Array.isArray(value) ? value[1] : value)
}
const byFirst = (item: unknown) => rowsWithV((valueOf(item) as unknown[])[0])
const bySecond = (item: unknown) => rowsWithV((valueOf(item) as unknown[])[1])

const PRESETS: Record<ChartType, Case | typeof NOT_CLICKABLE> = {
  line: presetCase({ type: "line" }, byY),
  area: presetCase({ type: "area" }, byY),
  stepLine: presetCase({ type: "stepLine" }, byY),
  stepArea: presetCase({ type: "stepArea" }, byY),
  bar: presetCase({ type: "bar" }, byY),
  stackedBar: presetCase({ type: "stackedBar" }, byY),
  scatter: presetCase({ type: "scatter" }, byY),
  pie: presetCase({ type: "pie" }, byY),
  candlestick: presetCase(
    {
      type: "candlestick",
      yColumns: [],
      ohlc: { open: "v", close: "w", low: "v", high: "w" },
    },
    byFirst,
  ),
  heatmap: presetCase(
    { type: "heatmap", yColumns: [], roles: { y: "state", value: "v" } },
    (item) => rowsWithV((valueOf(item) as unknown[])[2]),
  ),
  band: presetCase(
    { type: "band", roles: { lower: "v", upper: "w" } },
    (item, series) => (series.type === "custom" ? bySecond(item) : byY(item)),
  ),
  rangeBar: presetCase(
    { type: "rangeBar", yColumns: [], roles: { start: "v", end: "w" } },
    bySecond,
  ),
  boxplot: presetCase(
    {
      type: "boxplot",
      yColumns: [],
      roles: { min: "v", q1: "v", median: "v", q3: "v", max: "v" },
    },
    byFirst,
  ),
  // Event rows draw mark lines and areas, which take no clicks.
  events: NOT_CLICKABLE,
}

// Variants a preset draws differently: over time, merged shares of 100, and
// a Gantt of time ranges.
const PRESET_VARIANTS: Record<string, Case> = {
  "line over time": presetCase(
    { type: "line", xColumn: "ts" },
    (item) => rowsWithV((valueOf(item) as unknown[])[1]),
    "ts",
  ),
  "100% stacked bars of partitions": {
    statements: [fixture],
    marks: () => {
      const option = buildEchartsOption(
        { xColumn: "lane" },
        [
          preset({
            type: "stackedBar",
            partitionByColumn: "state",
            percentStack: true,
          }),
        ],
        { clickEnabled: true },
      )
      const categories = (option.xAxis as { data: string[] }).data
      // A bar holds the rows of its partition and category.
      return (option.series as { name: string; data: unknown[] }[]).flatMap(
        (s) =>
          s.data.map((item, i) => ({
            params: { data: item },
            rows:
              item === null
                ? []
                : rowsWhere(
                    fixture,
                    (row) =>
                      row[col("state")] === s.name &&
                      toLabel(row[col("lane")]) === categories[i],
                  ),
            drawn: "lane",
          })),
      )
    },
  },
  "rangeBar over time": presetCase(
    { type: "rangeBar", yColumns: [], roles: { start: "ts", end: "ts" } },
    (item) =>
      rowsWhere(fixture, (row) => row[0] === (valueOf(item) as unknown[])[1]),
  ),
}

// ── Visuals ───────────────────────────────────────────────────────────────

const context = (
  visual: VisualConfig,
  statements: StatementRows[],
): VisualContext => ({ visual, statements, colors: lightColors, formats: {} })

const echartsVisual = (
  build: (ctx: VisualContext) => { option: EChartsOption | null },
  visual: VisualConfig,
  rowsOf: (
    item: unknown,
    series: Record<string, unknown>,
  ) => Omit<Mark, "params">,
  statements: StatementRows[] = [fixture],
): Case => ({
  statements,
  marks: () => {
    const { option } = build(context(visual, statements))
    if (!option) throw new Error(`${visual.type} drew nothing`)
    return itemsOf(option).map(({ series, item }) => ({
      params: {
        data: item,
        ...(isLink(series, item) ? { dataType: "edge" } : {}),
      },
      ...rowsOf(item, series),
    }))
  },
})

// Graph nodes are drawn from the rows they are the source of, else those
// they are the target of; links from their row, by no column.
const flowMarks = (item: unknown, series: Record<string, unknown>) => {
  if (isLink(series, item))
    return { rows: rowsWithV((item as { value: number }).value) }
  const name = (item as { name: string }).name
  const sources = rowsWhere(
    fixture,
    (row) => toLabel(row[col("lane")]) === name,
  )
  return sources.length > 0
    ? { rows: sources, drawn: "lane" }
    : {
        rows: rowsWhere(fixture, (row) => toLabel(row[col("dst")]) === name),
        drawn: "dst",
      }
}

// A tree node is drawn from the rows under it, by its level's column.
const treeMarks = (path: string[]) => (item: unknown) => {
  const found: string[] = []
  const search = (nodes: unknown[], trail: string[]): boolean => {
    for (const node of nodes as { name: string; children?: unknown[] }[]) {
      const here = [...trail, node.name]
      if (node === item) {
        found.push(...here)
        return true
      }
      if (node.children && search(node.children, here)) return true
    }
    return false
  }
  search(treeRoots, [])
  return {
    rows: rowsWhere(fixture, (row) =>
      found.every((name, level) => toLabel(row[col(path[level])]) === name),
    ),
    drawn: path[found.length - 1],
  }
}
let treeRoots: unknown[] = []
const treeCase = (
  build: typeof treemapOption,
  type: "treemap" | "sunburst",
): Case => {
  const path = ["lane", "dst"]
  return {
    statements: [fixture],
    marks: () => {
      const { option } = build(
        context({ type, columns: { path, value: "v" } }, [fixture]),
      )
      treeRoots = (option?.series as { data: unknown[] }[])[0].data
      return itemsOf(option).map(({ item }) => ({
        params: { data: item },
        ...treeMarks(path)(item),
      }))
    },
  }
}

// An HTML visual's items, as the user clicks them: each reports its pick.
const htmlCase = (
  render: (onSelect: (pick: MarkPick) => void) => React.ReactElement,
  rowsOf: (element: HTMLElement) => Omit<Mark, "params">,
  selector: string,
  statements: StatementRows[] = [fixture],
): Case => ({
  statements,
  marks: () => {
    let picked: MarkPick | undefined
    const { container, unmount } = renderComponent(
      render((pick) => {
        picked = pick
      }),
    )
    const marks = Array.from(
      container.querySelectorAll<HTMLElement>(selector),
    ).map((element) => {
      picked = undefined
      fireEvent.click(element)
      return { params: { data: { pick: picked } }, ...rowsOf(element) }
    })
    unmount()
    return marks
  },
})

// Every item is clickable here; what a click writes is checked below.
const anything = () => "clicked"

const VISUALS: Record<VisualType, Case | typeof NOT_CLICKABLE> = {
  stat: htmlCase(
    (onSelect) => (
      <StatTiles
        visual={{ type: "stat", columns: { label: "lane", value: "v" } }}
        statements={[fixture]}
        formats={{}}
        pickLiteral={anything}
        onSelect={onSelect}
      />
    ),
    // A tile shows its row's v.
    (tile) => ({
      rows: rowsWithV(Number(/\d+/.exec(tile.textContent ?? "")?.[0])),
      drawn: "lane",
    }),
    '[data-hook="stat-tile"]',
  ),
  gauge: echartsVisual(
    gaugeOption,
    { type: "gauge", columns: { value: "v", label: "lane" } },
    () => ({ rows: [0], drawn: "lane" }),
  ),
  // Bullets and plans draw no items a click selects.
  bullet: NOT_CLICKABLE,
  orderBook: htmlCase(
    (onSelect) => (
      <OrderBook
        statements={[fixture, fixture]}
        columns={{ price: "px", size: "v" }}
        formats={{}}
        pickLiteral={anything}
        onSelect={onSelect}
      />
    ),
    // A level is named by its side and size, its row's v.
    (level) => {
      const [, side, size] =
        /^(Ask|Bid) .*, size (\d+)/.exec(
          level.getAttribute("aria-label") ?? "",
        ) ?? []
      return {
        statement: side === "Ask" ? 0 : 1,
        rows: rowsWithV(Number(size)),
        drawn: "px",
      }
    },
    '[data-hook^="order-book-"][aria-label]',
    [fixture, fixture],
  ),
  stateTimeline: echartsVisual(
    stateTimelineOption,
    {
      type: "stateTimeline",
      columns: { time: "ts", lane: "lane", state: "state" },
    },
    // A segment starts at its row's time.
    (item) => ({
      rows: rowsWhere(
        fixture,
        (row) => toTime(row[0]) === (valueOf(item) as number[])[0],
      ),
      drawn: "lane",
    }),
  ),
  uptime: htmlCase(
    (onSelect) => (
      <UptimeBars
        visual={{
          type: "uptime",
          columns: { time: "ts", lane: "lane", state: "state" },
        }}
        statements={[fixture]}
        pickLiteral={anything}
        onSelect={onSelect}
      />
    ),
    // A lane holds every row of its lane.
    (lane) => {
      const read = readStateSegments(
        {
          type: "uptime",
          columns: { time: "ts", lane: "lane", state: "state" },
        },
        fixture,
      )
      if (typeof read === "string") throw new Error(read)
      const name = read.lanes[Number(lane.dataset.laneIndex)]
      return {
        rows: rowsWhere(fixture, (row) => toLabel(row[col("lane")]) === name),
        drawn: "lane",
      }
    },
    "[data-lane-index]",
  ),
  treemap: treeCase(treemapOption, "treemap"),
  sunburst: treeCase(sunburstOption, "sunburst"),
  graph: echartsVisual(
    graphOption,
    { type: "graph", columns: { from: "lane", to: "dst", value: "v" } },
    flowMarks,
  ),
  sankey: echartsVisual(
    sankeyOption,
    { type: "sankey", columns: { from: "lane", to: "dst", value: "v" } },
    flowMarks,
  ),
  chord: echartsVisual(
    chordOption,
    { type: "chord", columns: { from: "lane", to: "dst", value: "v" } },
    flowMarks,
  ),
  map: echartsVisual(
    mapOption,
    { type: "map", columns: { label: "lane", value: "v" } },
    // A point shows its row's v after its coordinates.
    (item) => ({
      rows: rowsWithV((valueOf(item) as unknown[])[2]),
      drawn: "lane",
    }),
  ),
  liquidityHeatmap: echartsVisual(
    liquidityHeatmapOption,
    {
      type: "liquidityHeatmap",
      columns: { time: "ts", price: "v", value: "w" },
    },
    // A cell, and a point of the line (the second statement), at its row's
    // time.
    (item, series) => {
      const time = (valueOf(item) as number[])[0]
      return {
        statement: series.type === "line" ? 1 : 0,
        rows: rowsWhere(fixture, (row) => toTime(row[0]) === time),
        drawn: "ts",
      }
    },
    [fixture, fixture],
  ),
  volumeProfile: echartsVisual(
    volumeProfileOption,
    { type: "volumeProfile", columns: { price: "px", value: "v" } },
    (item) => ({ rows: rowsWithV(valueOf(item)), drawn: "px" }),
  ),
  footprint: echartsVisual(
    footprintOption,
    {
      type: "footprint",
      columns: { time: "ts", price: "px", buy: "v", sell: "w" },
    },
    // A level shows its row's buy (v) after its sell.
    (item) => ({
      rows: rowsWithV((valueOf(item) as unknown[])[3]),
      drawn: "px",
    }),
  ),
  planTree: NOT_CLICKABLE,
}

const VISUAL_VARIANTS: Record<string, Case> = {
  "map of regions": echartsVisual(
    mapOption,
    { type: "map", columns: { region: "lane", value: "v" } },
    (item) => ({ rows: rowsWithV(valueOf(item)), drawn: "lane" }),
    [withoutGeo],
  ),
}

// ── Custom charts ─────────────────────────────────────────────────────────

const charts: EChartsType[] = []
afterEach(() => {
  charts.splice(0).forEach((chart) => chart.dispose())
})

const customCase = (
  series: Record<string, unknown>,
  rowsOf: (
    item: unknown,
    series: Record<string, unknown>,
  ) => Omit<Mark, "params">,
  extra: Record<string, unknown> = {},
): Case => ({
  statements: [fixture],
  marks: () => {
    const { option, problems } = buildCustomOption(
      { ...extra, series: [series] },
      [fixture],
      false,
      true,
    )
    expect(problems).toEqual([])
    return itemsOf(option).map(({ series: s, item }) => ({
      params: {
        data: item,
        ...(isLink(s, item) ? { dataType: "edge" } : {}),
      },
      ...rowsOf(item, s),
    }))
  },
})

const rows$ = (spec: Record<string, unknown>) => ({ $rows: spec })

// The values a dataset-bound series draws, as ECharts reports their clicks.
const datasetCase = (
  raw: Record<string, unknown>,
  drawn: string | undefined,
): Case => ({
  statements: [fixture],
  marks: () => {
    const { option, problems } = buildCustomOption(raw, [fixture], false, true)
    expect(problems).toEqual([])
    const chart = echarts.init(null, undefined, {
      renderer: "svg",
      ssr: true,
      width: 640,
      height: 360,
    })
    charts.push(chart)
    chart.setOption(option)
    const model = (
      chart as unknown as {
        getModel(): {
          getSeriesByIndex(i: number): {
            getData(): { count(): number }
            getDataParams(i: number): Record<string, unknown>
          }
        }
      }
    ).getModel()
    const series = model.getSeriesByIndex(0)
    // `dataIndex` counts the series' own rows, after any transform.
    const count = series.getData().count()
    expect(count).toBeGreaterThan(0)
    return Array.from({ length: count }, (_, i) => {
      const params = series.getDataParams(i)
      // As the custom chart passes a click on, with the rows it matched.
      const value = params.value as unknown[]
      return {
        params: {
          ...params,
          pick: datasetPick(option, [fixture], 0, params.value),
        },
        rows: rowsWithV(value[V]),
        drawn,
      }
    })
  },
})

const CUSTOM: Record<string, Case> = {
  "$rows tuples": customCase(
    { type: "bar", data: rows$({ shape: "tuples", columns: ["lane", "v"] }) },
    (item) => ({ rows: bySecond(item), drawn: "lane" }),
    { xAxis: { type: "category" }, yAxis: {} },
  ),
  "$rows column": customCase(
    { type: "bar", data: rows$({ shape: "column", column: "v" }) },
    // A plain value is drawn from no column.
    (item) => ({ rows: rowsWithV(valueOf(item)) }),
    { xAxis: { type: "category" }, yAxis: {} },
  ),
  "$rows items": customCase(
    { type: "pie", data: rows$({ shape: "items", name: "lane", value: "v" }) },
    (item) => ({ rows: rowsWithV(valueOf(item)), drawn: "lane" }),
  ),
  "$rows tree": {
    statements: [fixture],
    marks: () => {
      const path = ["lane", "dst"]
      const { option } = buildCustomOption(
        {
          series: [
            {
              type: "treemap",
              data: rows$({ shape: "tree", path, value: "v" }),
            },
          ],
        },
        [fixture],
        false,
        true,
      )
      treeRoots = (option.series as { data: unknown[] }[])[0].data
      return itemsOf(option).map(({ item }) => ({
        params: { data: item },
        ...treeMarks(path)(item),
      }))
    },
  },
  "$rows lines": customCase(
    {
      type: "lines",
      coordinateSystem: "geo",
      data: rows$({
        shape: "lines",
        columns: ["lon", "lat", "lon", "lat"],
        name: "lane",
        value: "v",
      }),
    },
    (item) => ({ rows: rowsWithV(valueOf(item)), drawn: "lane" }),
  ),
  "$rows nodes and links": customCase(
    {
      type: "graph",
      data: rows$({ shape: "nodes", source: "lane", target: "dst" }),
      links: rows$({
        shape: "links",
        source: "lane",
        target: "dst",
        value: "v",
      }),
    },
    flowMarks,
  ),
  "dataset-bound bars": datasetCase(
    {
      xAxis: { type: "category" },
      yAxis: {},
      series: [{ type: "bar", datasetId: "q0", encode: { x: "lane", y: "v" } }],
    },
    "lane",
  ),
  "dataset-bound bars behind a filter": datasetCase(
    {
      dataset: [
        {
          id: "up",
          fromDatasetId: "q0",
          transform: {
            type: "filter",
            config: { dimension: "state", "=": "up" },
          },
        },
      ],
      xAxis: { type: "category" },
      yAxis: {},
      series: [{ type: "bar", datasetId: "up", encode: { x: "lane", y: "v" } }],
    },
    "lane",
  ),
  "dataset-bound pie": datasetCase(
    {
      series: [
        {
          type: "pie",
          datasetId: "q0",
          encode: { itemName: "lane", value: "v" },
        },
      ],
    },
    "lane",
  ),
  "dataset-bound points over time": datasetCase(
    {
      xAxis: { type: "time" },
      yAxis: {},
      series: [
        { type: "scatter", datasetId: "q0", encode: { x: "ts", y: "v" } },
      ],
    },
    // A time axis is no category: an unbound click selects nothing.
    undefined,
  ),
}

// ── The contract ──────────────────────────────────────────────────────────

/** What a click on a mark writes, bound to `column`, as the chart does it. */
const clickWrites = (
  statements: StatementRows[],
  column: string | undefined,
  mark: Mark,
): string | undefined => {
  const written: Record<string, string>[] = []
  interactionEvents(
    { click: { variable: "v", column } },
    (values) => written.push(values),
    () => statements,
  ).click({ componentType: "series", ...mark.params }, {} as EChartsType)
  return written[0]?.v
}

/** The literal all of `rows` agree on in `column`, read off the fixture. */
const expected = (
  statement: StatementRows,
  column: string | undefined,
  rows: number[],
): string | undefined => {
  const index = statement.columns.findIndex((c) => c.name === column)
  if (index < 0 || rows.length === 0) return undefined
  const literals = new Set(
    rows.map((r) =>
      sqlLiteral(statement.rows[r][index], statement.columns[index].type),
    ),
  )
  return literals.size === 1 ? [...literals][0] : undefined
}

// Bound columns of every type the console writes exactly.
const BOUND = ["id", "px", "ts", "state", "lane", "missing"]

const checkContract = ({ statements, marks }: Case) => {
  const all = marks()
  expect(all.length).toBeGreaterThan(0)
  for (const mark of all) {
    const statement = statements[mark.statement ?? 0]
    const where = JSON.stringify(mark.params.data ?? mark.params.value)
    // A mark with rows writes its drawn column; never something else.
    expect(clickWrites(statements, undefined, mark), `unbound ${where}`).toBe(
      mark.drawn === undefined
        ? undefined
        : expected(statement, mark.drawn, mark.rows),
    )
    for (const column of BOUND)
      expect(clickWrites(statements, column, mark), `${column} ${where}`).toBe(
        expected(statement, column, mark.rows),
      )
  }
  return all
}

describe("the selection contract", () => {
  it("has a case for every preset chart type and every visual", () => {
    expect(Object.keys(PRESETS).sort()).toEqual([...CHART_TYPES].sort())
    expect(Object.keys(VISUALS).sort()).toEqual([...VISUAL_TYPES].sort())
  })

  it.each(
    Object.entries({ ...PRESETS, ...PRESET_VARIANTS }).filter(
      (entry): entry is [string, Case] => entry[1] !== NOT_CLICKABLE,
    ),
  )("holds for every mark of a %s preset", (_type, contract) => {
    checkContract(contract)
  })

  it.each(
    Object.entries({ ...VISUALS, ...VISUAL_VARIANTS }).filter(
      (entry): entry is [string, Case] => entry[1] !== NOT_CLICKABLE,
    ),
  )("holds for every item of a %s visual", (_type, contract) => {
    checkContract(contract)
  })

  it.each(Object.entries(CUSTOM))(
    "holds for every mark of a custom chart's %s",
    (_shape, contract) => {
      checkContract(contract)
    },
  )

  it("covers marks drawn from several rows and from a NULL", () => {
    // Given the marks of a graph, whose node "a" is the source of two rows
    const marks = checkContract(VISUALS.graph as Case)

    // Then some mark merges rows and some is drawn from the NULL lane
    expect(marks.some((m) => m.rows.length > 1)).toBe(true)
    expect(
      marks.some((m) =>
        m.rows.some((r) => fixture.rows[r][col("lane")] === null),
      ),
    ).toBe(true)
  })

  it("resolves HTML items through the same resolver", () => {
    // Given a stat tile drawn from the NULL lane
    const [, nullTile] = (VISUALS.stat as Case).marks()
    const pick = (nullTile.params.data as { pick: MarkPick }).pick

    // Then it writes NULL unbound, and its LONG id exactly when bound
    expect(pickLiteral(pick, undefined, [fixture])).toBe("null")
    expect(pickLiteral(pick, "id", [fixture])).toBe("9007199254740995")
  })
})
