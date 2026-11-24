// @vitest-environment jsdom
import React from "react"
import { act } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { renderComponent } from "../../../../test/component"
import type {
  CellInteractions,
  ChartSync,
  NotebookCell,
} from "../../../../store/notebook"
import type { ColumnFormats } from "../../../../utils/formats/columnFormat"
import {
  CHART_TYPES,
  PIE_SHAPES,
  ROLE_FIELD,
  THRESHOLD_MARKS,
  isRoleChartType,
  type ChartConfig,
  type ChartType,
  type QueryChart,
  type VisualConfig,
} from "../CellChart/chartTypes"
import type { DrawSettings } from "../CellChart/drawSettings"
import { echarts as echartsForMaps } from "../CellChart/echartsSetup"
import { clearRenderReport } from "../renderReports"
import {
  instanceIn,
  resultOf,
  sleep,
  sqlOf,
  stubChartLayout,
  type Statement,
} from "./chartTestHarness"
import { DrawCanvas } from "./index"

// Pattern guard: a chart whose settings change from A to B must show what a
// chart drawn with B from the start shows. Nothing of A may stay behind on
// the reused ECharts instance (a removed mark line, a kept axis bound, an old
// colour scale). The settings space below is generated from the option lists
// of the chart types, so a new preset option is drawn here by construction.

const BUFFER_ID = 931
const notebook: { chartSync?: ChartSync } = {}

vi.mock("../NotebookProvider", () => ({
  useNotebookBufferId: () => 931,
  useNotebookSettings: () => notebook,
  useNotebookActions: () => ({
    setVariableValues: () => undefined,
    updateSettings: () => undefined,
    getVariables: () => [],
  }),
}))
vi.mock("../../../../modules/ConsoleEventTracker", () => ({
  trackEvent: vi.fn(),
}))

afterEach(() => {
  clearRenderReport(BUFFER_ID, "a")
  clearRenderReport(BUFFER_ID, "b")
  notebook.chartSync = undefined
})

const T0 = Date.UTC(2026, 0, 1)
const SIDES = ["buy", "sell", "hold"]
const hour = (i: number) => new Date(T0 + i * 3_600_000).toISOString()

const MAIN: Statement = {
  query: "select * from book",
  columns: [
    ["ts", "TIMESTAMP"],
    ["side", "SYMBOL"],
    ["price", "DOUBLE"],
    ["size", "DOUBLE"],
    ["open", "DOUBLE"],
    ["high", "DOUBLE"],
    ["low", "DOUBLE"],
    ["close", "DOUBLE"],
    ["lower", "DOUBLE"],
    ["upper", "DOUBLE"],
    ["start_ts", "TIMESTAMP"],
    ["end_ts", "TIMESTAMP"],
    ["mn", "DOUBLE"],
    ["q1", "DOUBLE"],
    ["med", "DOUBLE"],
    ["q3", "DOUBLE"],
    ["mx", "DOUBLE"],
  ].map(([name, type]) => ({ name, type })),
  rows: Array.from({ length: 24 }, (_, i) => {
    const p = 100 + ((i * 37) % 60)
    return [
      hour(i),
      SIDES[i % 3],
      p,
      1 + (i % 7),
      p - 2,
      p + 5,
      p - 6,
      p + 1,
      p - 8,
      p + 8,
      hour(i),
      hour(i + 2),
      p - 10,
      p - 4,
      p,
      p + 4,
      p + 10,
    ]
  }),
}
const EVENTS: Statement = {
  query: "select ts, label from incidents",
  columns: [
    { name: "ts", type: "TIMESTAMP" },
    { name: "label", type: "STRING" },
  ],
  rows: [
    [hour(3), "deploy"],
    [hour(11), "failover"],
  ],
}
const PRESET_STATEMENTS = [MAIN, EVENTS]

// The columns each role chart type reads, so every type draws.
const ROLES: Record<keyof typeof ROLE_FIELD, Record<string, string>> = {
  heatmap: { y: "side", value: "price" },
  band: { lower: "lower", upper: "upper" },
  rangeBar: { start: "start_ts", end: "end_ts" },
  boxplot: { min: "mn", q1: "q1", median: "med", q3: "q3", max: "mx" },
}

const queryOf = (type: Exclude<ChartType, "events">): QueryChart => ({
  type,
  yColumns: ["price"],
  ...(type === "candlestick"
    ? { ohlc: { open: "open", high: "high", low: "low", close: "close" } }
    : {}),
  ...(isRoleChartType(type) ? { [ROLE_FIELD[type]]: ROLES[type] } : {}),
})

const eventsQuery = (enabled: boolean): QueryChart => ({
  type: "events",
  yColumns: [],
  events: { time: "ts", label: "label" },
  enabled,
})

type Settings = {
  draw: DrawSettings
  crosshair?: ChartSync["crosshair"]
  statements: Statement[]
}

const THRESHOLD_FORMATS: ColumnFormats = {
  price: {
    thresholds: [
      { value: 120, tone: "warning" },
      { value: 150, tone: "negative" },
    ],
  },
}

const preset = (
  type: Exclude<ChartType, "events">,
  edit: (config: ChartConfig, query: QueryChart) => void = () => undefined,
  draw: Omit<DrawSettings, "chartConfig"> = { formats: THRESHOLD_FORMATS },
): Settings => {
  const query = queryOf(type)
  const chartConfig: ChartConfig = {
    xColumn: "ts",
    queries: [query, eventsQuery(false)],
  }
  edit(chartConfig, query)
  return { draw: { chartConfig, ...draw }, statements: PRESET_STATEMENTS }
}

type Edit = (config: ChartConfig, query: QueryChart) => void

// One entry per field of the preset settings. A field added to ChartConfig,
// QueryChart or DrawSettings does not compile until it has its variations.
const CHART_VARIATIONS = {
  xColumn: [(c) => void (c.xColumn = "side")],
  queries: [], // the query fields below
  rightAxis: [(c) => void (c.rightAxis = { name: "Right", min: 0, max: 400 })],
  horizontal: [(c) => void (c.horizontal = true)],
  thresholds: THRESHOLD_MARKS.map((mode) => (c) => void (c.thresholds = mode)),
  visual: [], // VISUAL_PAIRS
  custom: [], // CUSTOM_PAIRS
} satisfies Record<keyof ChartConfig, Edit[]>

const QUERY_VARIATIONS = {
  // Type changes run in a ring over every chart type (TYPE_PAIRS).
  type: [],
  yColumns: [(_, q) => void (q.yColumns = ["price", "size"])],
  // Role columns are each type's own (ROLES); a role chart redrawn with other
  // columns is a refresh of its axes.
  ohlc: [(_, q) => void (q.ohlc = q.ohlc && { ...q.ohlc, close: "open" })],
  heatmap: [
    (_, q) => void (q.heatmap = q.heatmap && { y: "side", value: "size" }),
  ],
  band: [(_, q) => void (q.band = q.band && { lower: "low", upper: "high" })],
  range: [(_, q) => void (q.range = q.range && { start: "ts", end: "end_ts" })],
  box: [(_, q) => void (q.box = q.box && { ...q.box, median: "price" })],
  percentStack: [(_, q) => void (q.percentStack = true)],
  pieShape: PIE_SHAPES.map((shape) => (_, q) => void (q.pieShape = shape)),
  scatter: [
    (_, q) => void (q.scatter = { size: "size" }),
    (_, q) => void (q.scatter = { color: "size" }),
    (_, q) => void (q.scatter = { size: "size", color: "price" }),
  ],
  partitionByColumn: [(_, q) => void (q.partitionByColumn = "side")],
  axis: [(_, q) => void (q.axis = "right")],
  enabled: [(c) => void (c.queries[1] = eventsQuery(true))],
  name: [(_, q) => void (q.name = "Renamed")],
  events: [
    (c) =>
      void (c.queries[1] = {
        ...eventsQuery(true),
        events: { time: "ts", end: "ts", label: "label" },
      }),
  ],
} satisfies Record<keyof QueryChart, Edit[]>

const DRAW_VARIATIONS = {
  chartConfig: [], // CHART_VARIATIONS and QUERY_VARIATIONS
  formats: [
    {} as ColumnFormats,
    { price: { decimals: 2, prefix: "$" } } as ColumnFormats,
  ],
  interactions: [
    { click: { variable: "picked" } },
    { brush: { from: "t0", to: "t1" } },
  ] as CellInteractions[],
} satisfies { [K in keyof DrawSettings]-?: DrawSettings[K][] }

const CROSSHAIRS: ChartSync["crosshair"][] = ["line", "tooltip"]

const DRAWN_TYPES = CHART_TYPES.filter(
  (type): type is Exclude<ChartType, "events"> => type !== "events",
)

type Pair = [name: string, from: Settings, to: Settings]

// Each variation is drawn on and off one chart type, the types taking turns,
// so every option meets several types over the list.
const variationPairs = (): Pair[] => {
  const pairs: Pair[] = []
  let turn = 0
  const both = (
    name: string,
    on: (type: (typeof DRAWN_TYPES)[number]) => Settings,
  ) => {
    // Each option on a line chart, and on the next type in turn.
    for (const type of [
      "line",
      DRAWN_TYPES[turn++ % DRAWN_TYPES.length],
    ] as const) {
      pairs.push([`${type}: ${name} on`, preset(type), on(type)])
      pairs.push([`${type}: ${name} off`, on(type), preset(type)])
    }
  }
  for (const [field, edits] of Object.entries({
    ...CHART_VARIATIONS,
    ...QUERY_VARIATIONS,
  }) as [string, Edit[]][])
    edits.forEach((edit, i) =>
      both(`${field} #${i + 1}`, (type) => preset(type, edit)),
    )
  DRAW_VARIATIONS.formats.forEach((formats, i) =>
    both(`formats #${i + 1}`, (type) => preset(type, undefined, { formats })),
  )
  DRAW_VARIATIONS.interactions.forEach((interactions, i) =>
    both(`interactions #${i + 1}`, (type) =>
      preset(type, undefined, { formats: THRESHOLD_FORMATS, interactions }),
    ),
  )
  for (const crosshair of CROSSHAIRS)
    both(`crosshair ${crosshair}`, (type) => ({ ...preset(type), crosshair }))
  return pairs
}

// Every chart type turns into the next one, and back.
const TYPE_PAIRS: Pair[] = DRAWN_TYPES.flatMap((type, i) => {
  const next = DRAWN_TYPES[(i + 1) % DRAWN_TYPES.length]
  return [
    [`${type} -> ${next}`, preset(type), preset(next)],
    [`${next} -> ${type}`, preset(next), preset(type)],
  ] as Pair[]
})

// A few options together, then others: changes that land in one save.
const COMBINED_PAIRS: Pair[] = [
  [
    "thresholds off and events on in one save",
    preset("line", (c) => void (c.thresholds = "bands")),
    preset("line", (c) => void (c.queries[1] = eventsQuery(true))),
  ],
  [
    "lines thresholds to bands with a second column",
    preset("line", (c) => void (c.thresholds = "lines")),
    preset("line", (c, q) => {
      c.thresholds = "bands"
      q.yColumns = ["price", "size"]
    }),
  ],
  [
    "partitioned scatter with scales to plain line",
    preset("scatter", (_, q) => {
      q.partitionByColumn = "side"
      q.scatter = { size: "size", color: "price" }
    }),
    preset("line"),
  ],
  [
    "horizontal bars with a right axis to upright bars",
    preset("bar", (c, q) => {
      c.horizontal = true
      q.yColumns = ["price", "size"]
      c.rightAxis = { min: 0, max: 50 }
    }),
    preset("bar"),
  ],
  [
    "percent stacked areas to plain lines",
    preset("area", (_, q) => {
      q.percentStack = true
      q.partitionByColumn = "side"
    }),
    preset("line", (_, q) => void (q.partitionByColumn = "side")),
  ],
]

const customOf = (option: Record<string, unknown>): Settings => ({
  draw: { chartConfig: { xColumn: null, queries: [], custom: { option } } },
  statements: [MAIN],
})
const LINE = { type: "line", datasetId: "q0", encode: { x: "ts", y: "price" } }
const CUSTOM_BASE = {
  xAxis: { type: "time" },
  yAxis: { type: "value" },
  series: [LINE],
}
const CUSTOM_PAIRS: Pair[] = (
  [
    [
      "mark line",
      { series: [{ ...LINE, markLine: { data: [{ yAxis: 130 }] } }] },
    ],
    [
      "second series",
      {
        series: [
          LINE,
          { type: "bar", datasetId: "q0", encode: { x: "ts", y: "size" } },
        ],
      },
    ],
    ["legend and title", { legend: { show: true }, title: { text: "Book" } }],
    [
      "colour scale",
      { visualMap: { min: 100, max: 160, dimension: "price", seriesIndex: 0 } },
    ],
    ["authored zoom", { dataZoom: [{ type: "inside", start: 50, end: 100 }] }],
    ["y bounds", { yAxis: { type: "value", min: 0, max: 400 } }],
    [
      "category axis",
      {
        xAxis: { type: "category" },
        series: [{ ...LINE, encode: { x: "side", y: "price" } }],
      },
    ],
  ] as [string, Record<string, unknown>][]
).flatMap(([name, part]) => {
  const on = customOf({ ...CUSTOM_BASE, ...part })
  return [
    [`custom: ${name} on`, customOf(CUSTOM_BASE), on],
    [`custom: ${name} off`, on, customOf(CUSTOM_BASE)],
  ] as Pair[]
})

const TREE: Statement = {
  query: "select region, desk, pnl from desks",
  columns: [
    { name: "region", type: "SYMBOL" },
    { name: "desk", type: "SYMBOL" },
    { name: "pnl", type: "DOUBLE" },
  ],
  rows: [
    ["EU", "rates", 12],
    ["EU", "fx", 7],
    ["US", "rates", 9],
    ["US", "credit", 4],
  ],
}
const FLOWS: Statement = {
  query: "select src, dst, qty from flows",
  columns: [
    { name: "src", type: "SYMBOL" },
    { name: "dst", type: "SYMBOL" },
    { name: "qty", type: "DOUBLE" },
  ],
  rows: [
    ["a", "b", 5],
    ["a", "c", 3],
    ["b", "d", 2],
  ],
}
const STATES: Statement = {
  query: "select ts, robot, state from robots",
  columns: [
    { name: "ts", type: "TIMESTAMP" },
    { name: "robot", type: "SYMBOL" },
    { name: "state", type: "SYMBOL" },
  ],
  rows: Array.from({ length: 12 }, (_, i) => [
    hour(i),
    `R-${i % 2}`,
    ["up", "down", "idle"][i % 3],
  ]),
}
const PLACES: Statement = {
  query: "select lat, lon, trades from venues",
  columns: [
    { name: "lat", type: "DOUBLE" },
    { name: "lon", type: "DOUBLE" },
    { name: "trades", type: "DOUBLE" },
  ],
  rows: [
    [48.9, 2.35, 3],
    [51.5, -0.12, 5],
  ],
}
const REGIONS: Statement = {
  query: "select country, trades from venues",
  columns: [
    { name: "country", type: "SYMBOL" },
    { name: "trades", type: "DOUBLE" },
  ],
  rows: [["France", 3]],
}
// A stand-in for the world map, which loads from a chunk in the app.
echartsForMaps.registerMap("world", {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { name: "France" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-5, 42],
            [8, 42],
            [8, 51],
            [-5, 51],
            [-5, 42],
          ],
        ],
      },
    },
  ],
} as unknown as Parameters<typeof echartsForMaps.registerMap>[1])
const visualOf = (visual: VisualConfig, statement: Statement): Settings => ({
  draw: { chartConfig: { xColumn: null, queries: [], visual } },
  statements: [statement],
})
const path = { path: ["region", "desk"], value: "pnl" }
const flow = { from: "src", to: "dst", value: "qty" }
const VISUAL_PAIRS: Pair[] = (
  [
    [
      "gauge bounds",
      visualOf({ type: "gauge", min: 0, max: 400 }, MAIN),
      visualOf({ type: "gauge" }, MAIN),
    ],
    [
      "treemap to sunburst",
      visualOf({ type: "treemap", columns: path }, TREE),
      visualOf({ type: "sunburst", columns: path }, TREE),
    ],
    [
      "graph to sankey",
      visualOf({ type: "graph", columns: flow }, FLOWS),
      visualOf({ type: "sankey", columns: flow }, FLOWS),
    ],
    [
      "sankey to chord",
      visualOf({ type: "sankey", columns: flow }, FLOWS),
      visualOf({ type: "chord", columns: flow }, FLOWS),
    ],
    [
      "map points to regions",
      visualOf({ type: "map" }, PLACES),
      visualOf({ type: "map" }, REGIONS),
    ],
    [
      "state severities",
      visualOf({ type: "stateTimeline" }, STATES),
      visualOf(
        { type: "stateTimeline", severity: { idle: "warning", up: "bad" } },
        STATES,
      ),
    ],
  ] as Pair[]
).flatMap(([name, a, b]) => [
  [`visual: ${name}`, a, b],
  [`visual: ${name} (back)`, b, a],
])

// A refresh whose rows change what is drawn, under the same settings.
const withRows = (statement: Statement, rows: unknown[][]): Statement => ({
  ...statement,
  rows,
})
const twoSides = MAIN.rows.filter((row) => row[1] !== "hold")
const nullSizes = MAIN.rows.map((row) =>
  row.map((v, i) => (i === 3 ? null : v)),
)
const refreshed = (
  settings: Settings,
  rows: (statements: Statement[]) => Statement[],
): Settings => ({ ...settings, statements: rows(settings.statements) })
const DATA_PAIRS: Pair[] = (
  [
    [
      "a partition disappears",
      preset("line", (_, q) => void (q.partitionByColumn = "side")),
      ([main, ...rest]: Statement[]) => [withRows(main, twoSides), ...rest],
    ],
    [
      "a colour scale's values all turn NULL",
      preset("scatter", (_, q) => void (q.scatter = { color: "size" })),
      ([main, ...rest]: Statement[]) => [withRows(main, nullSizes), ...rest],
    ],
    [
      "the events run out",
      preset("line", (c) => void (c.queries[1] = eventsQuery(true))),
      ([main, events]: Statement[]) => [main, withRows(events, [])],
    ],
    [
      "map points spread from one region over the world",
      visualOf({ type: "map" }, PLACES),
      ([places]: Statement[]) => [
        withRows(places, [...places.rows, [-33.9, 151.2, 4], [40.7, -74, 6]]),
      ],
    ],
    [
      "a state stops occurring",
      visualOf({ type: "stateTimeline" }, STATES),
      ([states]: Statement[]) => [
        withRows(
          states,
          states.rows.filter((row) => row[2] !== "down"),
        ),
      ],
    ],
  ] as [string, Settings, (s: Statement[]) => Statement[]][]
).flatMap(([name, settings, rows]) => [
  [`refresh: ${name}`, settings, refreshed(settings, rows)],
  [`refresh: ${name} (back)`, refreshed(settings, rows), settings],
])

// Switching what the cell draws on the same rows.
const KIND_PAIRS: Pair[] = [
  [
    "preset -> custom",
    { ...preset("line"), statements: [MAIN] },
    customOf(CUSTOM_BASE),
  ],
  [
    "custom -> visual",
    customOf(CUSTOM_BASE),
    visualOf({ type: "gauge" }, MAIN),
  ],
  [
    "visual -> preset",
    visualOf({ type: "gauge" }, MAIN),
    { ...preset("line"), statements: [MAIN] },
  ],
]

// ------------------------------------------------------------------------

const cellOf = ({ draw, statements }: Settings): NotebookCell => ({
  id: "a",
  position: 0,
  value: sqlOf(statements),
  mode: "draw",
  result: resultOf(statements),
  chartConfig: draw.chartConfig,
  ...(draw.formats ? { formats: draw.formats } : {}),
  ...(draw.interactions ? { interactions: draw.interactions } : {}),
})

const noop = () => undefined
const view = (settings: Settings) => {
  notebook.chartSync = settings.crosshair
    ? { crosshair: settings.crosshair, zoom: false }
    : undefined
  return (
    <div style={{ height: 400 }}>
      <DrawCanvas
        cell={cellOf(settings)}
        isFocused={false}
        refreshIntervalMs={undefined}
        onSettingsChange={noop}
        onRetryUnmountWhileFocused={noop}
      />
    </div>
  )
}

// What a reader sees: the option ECharts holds, without the view state the
// user owns (zoom window, legend selection) and the entry animation, plus the
// colour ECharts gave each series.
const VIEW_KEYS = new Set(["start", "end", "startValue", "endValue"])
const normalize = (value: unknown, key = ""): unknown => {
  if (typeof value === "function") return "fn"
  if (Array.isArray(value)) return value.map((v) => normalize(v))
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      if (key === "dataZoom" && VIEW_KEYS.has(k)) continue
      if (key === "legend" && k === "selected") continue
      out[k] = normalize(v, key === "" ? k : key)
    }
    return out
  }
  return value
}
type Model = {
  getSeries(): {
    name: string
    getData(): { getVisual(key: "style"): Record<string, unknown> }
  }[]
}
const snapshot = (root: ParentNode) => {
  const instance = instanceIn(root)
  if (!instance) return undefined
  const option = instance.getOption() as Record<string, unknown>
  if (!option || !option.series) return undefined
  const { animation: _a, animationDuration: _d, ...rest } = option
  const model = (instance as unknown as { getModel(): Model }).getModel()
  let seriesColors: unknown[]
  try {
    seriesColors = model.getSeries().map((s) => {
      const style = s.getData().getVisual("style") ?? {}
      return [s.name, style.fill, style.stroke]
    })
  } catch {
    // A lazy update not drawn yet has no series data.
    return undefined
  }
  return JSON.stringify(normalize({ ...rest, seriesColors }))
}

// The chart draws asynchronously (lazy chart code, instance creation on a
// frame): wait until what it shows stops changing.
const settled = async (root: ParentNode) => {
  let last: string | undefined
  let stable = 0
  for (let i = 0; i < 100 && stable < 3; i++) {
    await act(() => sleep(15))
    const next = snapshot(root)
    stable = next !== undefined && next === last ? stable + 1 : 0
    last = next
  }
  if (last === undefined) throw new Error("the chart did not draw")
  return last
}

const fresh = new Map<string, string>()
const freshSnapshot = async (settings: Settings) => {
  const key = JSON.stringify(settings)
  const known = fresh.get(key)
  if (known) return known
  const { container, unmount } = renderComponent(view(settings))
  const shown = await settled(container)
  unmount()
  fresh.set(key, shown)
  return shown
}

const changed = async (from: Settings, to: Settings) => {
  const { container, rerender, unmount } = renderComponent(view(from))
  await settled(container)
  rerender(view(to))
  const shown = await settled(container)
  unmount()
  return shown
}

// The paths where two snapshots differ, with both values: a short failure.
const differences = (a: unknown, b: unknown, at = ""): string[] => {
  if (JSON.stringify(a) === JSON.stringify(b)) return []
  if (a && b && typeof a === "object" && typeof b === "object") {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)])
    return [...keys].flatMap((k) =>
      differences(
        (a as Record<string, unknown>)[k],
        (b as Record<string, unknown>)[k],
        `${at}.${k}`,
      ),
    )
  }
  return [`${at}: ${JSON.stringify(a)} != fresh ${JSON.stringify(b)}`]
}

const check = async ([, from, to]: Pair) => {
  stubChartLayout()
  const expected = await freshSnapshot(to)
  stubChartLayout()
  const shown = await changed(from, to)
  expect(differences(JSON.parse(shown), JSON.parse(expected))).toEqual([])
}

// Today's renderer still keeps these from A (see the commit message).
const KNOWN_STALE = new Set<string>([
  "visual: state severities",
  "visual: state severities (back)",
])

describe("a chart whose settings change shows what a fresh chart shows", () => {
  const all: Pair[] = [
    ...variationPairs(),
    ...TYPE_PAIRS,
    ...COMBINED_PAIRS,
    ...CUSTOM_PAIRS,
    ...VISUAL_PAIRS,
    ...DATA_PAIRS,
    ...KIND_PAIRS,
  ]
  for (const pair of all) {
    const run = KNOWN_STALE.has(pair[0]) ? it.fails : it
    run(pair[0], () => check(pair), 20_000)
  }
})
