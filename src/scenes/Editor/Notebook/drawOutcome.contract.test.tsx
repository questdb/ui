// @vitest-environment jsdom
import React from "react"
import { act } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { EChartsOption } from "echarts"
import { renderComponent } from "../../../test/component"
import type { CellResult, NotebookCell } from "../../../store/notebook"
import {
  CHART_TYPES,
  ROLE_FIELD,
  VISUAL_TYPES,
  isRoleChartType,
  type ChartConfig,
  type ChartType,
  type QueryChart,
  type VisualConfig,
  type VisualType,
} from "./CellChart/chartTypes"
import { VISUAL_CATALOG } from "./visuals/visualCatalog"
import { clearRenderReport, getRenderReport } from "./renderReports"
import type { DrawStatus } from "./drawOutcome"
import { DrawCanvas } from "./DrawCanvas"

// The draw-outcome contract: whatever a draw cell shows, its pane and the
// agent's render report say the same thing. For every preset chart type,
// every visual and custom options, through every state a draw can be in, the
// pane shows a spinner only while the report says the draw is waiting, an
// alert only for a blocked or failed draw, a reason only for an empty or
// refused one, and the drawing only when the report says it is drawn; its
// sentence is the report's first problem. A failure never reads as "no
// rows", waiting never reads as empty, and after a change of state the report
// follows the pane.

const BUFFER_ID = 607
const CELL_ID = "contract"

type Fetch = {
  sql: string
  settled: boolean
  classifyBlock: unknown
  fetchCancelled: boolean
  loading: boolean
}
const engine = vi.hoisted(
  (): Fetch => ({
    sql: "",
    settled: true,
    classifyBlock: null,
    fetchCancelled: false,
    loading: false,
  }),
)
const maps = vi.hoisted(() => ({
  status: "ready" as "ready" | "loading" | "error",
}))

vi.mock("./cellRefresh/CellRefreshContext", async (orig) => {
  const actual = await orig<Record<string, unknown>>()
  const refresh = await import("./cellRefresh/cellRefreshEngine")
  // One state per SQL, so its queries keep their identity across renders as
  // the engine's do.
  const states = new Map<
    string,
    ReturnType<typeof refresh.pendingCellFetchState>
  >()
  return {
    ...actual,
    useCellFetchSelector: (_id: string, select: (s: unknown) => unknown) => {
      const state =
        states.get(engine.sql) ?? refresh.pendingCellFetchState(engine.sql)
      states.set(engine.sql, state)
      return select({
        ...state,
        settledKey: engine.settled ? state.queriesKey : null,
        classifyBlock: engine.classifyBlock,
        fetchCancelled: engine.fetchCancelled,
      })
    },
  }
})
vi.mock("./cells/useChartLoading", () => ({
  useChartLoading: () => ({ loading: engine.loading, stopVisible: false }),
}))
vi.mock("./NotebookProvider", () => ({
  useNotebookBufferId: () => 607,
  useNotebookSettings: () => ({}),
  useNotebookActions: () => ({
    setVariableValues: () => undefined,
    updateSettings: () => undefined,
    getVariables: () => [],
  }),
}))
vi.mock("../../../modules/ConsoleEventTracker", () => ({
  trackEvent: vi.fn(),
}))
vi.mock("./CellChart/DrawSettingsDrawer", () => ({
  DrawSettingsDrawer: () => null,
}))
// ECharts itself is not under test: the stand-in shows the option it gets.
vi.mock("./CellChart/ChartRenderer", () => ({
  ChartRenderer: ({ option }: { option: EChartsOption }) => {
    const series = option.series
    const count = Array.isArray(series) ? series.length : series ? 1 : 0
    return <div data-hook="echarts-chart" data-series={count} />
  },
}))
// The chart code, without the lazy chunks.
vi.mock("./CellChart/lazyCharts", async () => {
  const { ChartRenderer } = await import("./CellChart/ChartRenderer")
  const { VisualCanvas } = await import("./visuals/VisualCanvas")
  const { CustomChart } = await import("./customChart/CustomChart")
  return {
    ChartSuspense: ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ),
    LazyChartRenderer: ChartRenderer,
    LazyVisualCanvas: VisualCanvas,
    LazyCustomChart: CustomChart,
    preloadChartCode: () => undefined,
  }
})
vi.mock("./customChart/maps", async (orig) => {
  const actual = await orig<typeof import("./customChart/maps")>()
  return {
    ...actual,
    isMapLoaded: () => maps.status === "ready",
    ensureMaps: () =>
      maps.status === "error"
        ? Promise.reject(new Error("offline"))
        : maps.status === "loading"
          ? new Promise<void>(() => undefined)
          : Promise.resolve(),
  }
})

afterEach(() => {
  clearRenderReport(BUFFER_ID, CELL_ID)
  Object.assign(engine, {
    sql: "",
    settled: true,
    classifyBlock: null,
    fetchCancelled: false,
    loading: false,
  })
  maps.status = "ready"
})

// ── Rows ──────────────────────────────────────────────────────────────────

type Statement = {
  query: string
  columns: { name: string; type: string }[]
  rows: unknown[][]
}

const T0 = Date.UTC(2026, 0, 1)
const hour = (i: number) => new Date(T0 + i * 3_600_000).toISOString()
const statement = (
  query: string,
  columns: [string, string][],
  rows: unknown[][],
): Statement => ({
  query,
  columns: columns.map(([name, type]) => ({ name, type })),
  rows,
})

const MAIN = statement(
  "select * from book",
  [
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
  ],
  Array.from({ length: 12 }, (_, i) => {
    const p = 100 + ((i * 37) % 60)
    return [
      hour(i),
      ["buy", "sell", "hold"][i % 3],
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
)
const EVENTS = statement(
  "select ts, label from incidents",
  [
    ["ts", "TIMESTAMP"],
    ["label", "STRING"],
  ],
  [
    [hour(3), "deploy"],
    [hour(9), "failover"],
  ],
)
const DESKS = statement(
  "select desk, pnl, target from desks",
  [
    ["desk", "SYMBOL"],
    ["pnl", "DOUBLE"],
    ["target", "DOUBLE"],
  ],
  [
    ["rates", 12, 20],
    ["fx", 7, 5],
    ["credit", 4, 10],
  ],
)
const ASKS = statement(
  "select price, size from asks",
  [
    ["price", "DOUBLE"],
    ["size", "DOUBLE"],
  ],
  [
    [101, 2],
    [102, 3],
  ],
)
const BIDS = { ...ASKS, query: "select price, size from bids", rows: [[99, 4]] }
const STATES = statement(
  "select ts, robot, state from robots",
  [
    ["ts", "TIMESTAMP"],
    ["robot", "SYMBOL"],
    ["state", "SYMBOL"],
  ],
  Array.from({ length: 12 }, (_, i) => [
    hour(i),
    `R-${i % 2}`,
    ["up", "down", "idle"][i % 3],
  ]),
)
const TREE = statement(
  "select region, desk, pnl from desks",
  [
    ["region", "SYMBOL"],
    ["desk", "SYMBOL"],
    ["pnl", "DOUBLE"],
  ],
  [
    ["EU", "rates", 12],
    ["EU", "fx", 7],
    ["US", "rates", 9],
  ],
)
const FLOWS = statement(
  "select src, dst, qty from flows",
  [
    ["src", "SYMBOL"],
    ["dst", "SYMBOL"],
    ["qty", "DOUBLE"],
  ],
  [
    ["a", "b", 5],
    ["a", "c", 3],
    ["b", "d", 2],
  ],
)
const REGIONS = statement(
  "select country, trades from venues",
  [
    ["country", "SYMBOL"],
    ["trades", "DOUBLE"],
  ],
  [
    ["France", 3],
    ["Spain", 5],
  ],
)
const CELLS = statement(
  "select ts, price, size from depth",
  [
    ["ts", "TIMESTAMP"],
    ["price", "DOUBLE"],
    ["size", "DOUBLE"],
  ],
  Array.from({ length: 8 }, (_, i) => [hour(i >> 1), 100 + (i % 2), 5 + i]),
)
const LEVELS = statement(
  "select price, buy, sell from profile",
  [
    ["price", "DOUBLE"],
    ["buy", "DOUBLE"],
    ["sell", "DOUBLE"],
  ],
  [
    [100, 1, 2],
    [101, 3, 1],
  ],
)
const FOOT = statement(
  "select ts, lvl, buy, sell from footprint",
  [
    ["ts", "TIMESTAMP"],
    ["lvl", "DOUBLE"],
    ["buy", "DOUBLE"],
    ["sell", "DOUBLE"],
  ],
  [
    [hour(0), 100, 1, 2],
    [hour(0), 101, 3, 1],
    [hour(1), 100, 2, 2],
  ],
)
const PLAN = statement(
  "explain select * from trades",
  [["QUERY PLAN", "STRING"]],
  [
    ["SelectedRecord"],
    ["    Async JIT Filter workers: 4"],
    ["      filter: price>10"],
    ["        PageFrame"],
  ],
)

// ── What each kind draws ──────────────────────────────────────────────────

type DrawCase = {
  config: ChartConfig
  statements: Statement[]
  // The same drawing with a bound column the result does not have, and what
  // it shows then: refused, or drawn from the column it falls back to.
  missing: { config: ChartConfig; status: DrawStatus }
  // A row-capped result: drawn, or refused where the drawing needs every row.
  capped: DrawStatus
  // The first statement failed while the others returned rows.
  firstFails?: DrawStatus
}

const ROLES: Record<keyof typeof ROLE_FIELD, Record<string, string>> = {
  heatmap: { y: "side", value: "price" },
  band: { lower: "lower", upper: "upper" },
  rangeBar: { start: "start_ts", end: "end_ts" },
  boxplot: { min: "mn", q1: "q1", median: "med", q3: "q3", max: "mx" },
}
const NOPE_ROLES: Record<keyof typeof ROLE_FIELD, Record<string, string>> = {
  heatmap: { y: "nope", value: "nope" },
  band: { lower: "nope", upper: "nope" },
  rangeBar: { start: "nope", end: "nope" },
  boxplot: { min: "nope", q1: "nope", median: "nope", q3: "nope", max: "nope" },
}

const queryOf = (
  type: Exclude<ChartType, "events">,
  roles = ROLES,
  yColumns = ["price"],
): QueryChart => ({
  type,
  yColumns,
  ...(type === "candlestick"
    ? { ohlc: { open: "open", high: "high", low: "low", close: "close" } }
    : {}),
  ...(isRoleChartType(type) ? { [ROLE_FIELD[type]]: roles[type] } : {}),
})

const presetCase = (
  type: Exclude<ChartType, "events">,
  missing: DrawStatus,
  capped: DrawStatus = "drawn",
): DrawCase => ({
  config: { xColumn: "ts", queries: [queryOf(type)] },
  statements: [MAIN],
  missing: {
    config: {
      xColumn: "ts",
      queries: [
        isRoleChartType(type)
          ? queryOf(type, NOPE_ROLES)
          : type === "candlestick"
            ? {
                ...queryOf(type),
                ohlc: { open: "nope", high: "nope", low: "nope", close: "x" },
              }
            : queryOf(type, ROLES, ["nope"]),
      ],
    },
    status: missing,
  },
  capped,
})

// A missing y column leaves nothing to draw; missing OHLC or role columns
// fall back to the columns their names or kinds suggest.
const PRESETS: Record<ChartType, DrawCase> = {
  line: presetCase("line", "refused"),
  area: presetCase("area", "refused"),
  stepLine: presetCase("stepLine", "refused"),
  stepArea: presetCase("stepArea", "refused"),
  bar: presetCase("bar", "refused"),
  stackedBar: presetCase("stackedBar", "refused"),
  scatter: presetCase("scatter", "refused"),
  // A pie shows shares of the whole: refused from a row-capped result.
  pie: presetCase("pie", "refused", "refused"),
  candlestick: presetCase("candlestick", "drawn"),
  heatmap: presetCase("heatmap", "drawn"),
  band: presetCase("band", "drawn"),
  rangeBar: presetCase("rangeBar", "drawn"),
  boxplot: presetCase("boxplot", "drawn"),
  // Events mark the time axis of the series drawn next to them.
  events: {
    config: {
      xColumn: "ts",
      queries: [
        queryOf("line"),
        {
          type: "events",
          yColumns: [],
          events: { time: "ts", label: "label" },
        },
      ],
    },
    statements: [MAIN, EVENTS],
    missing: {
      config: {
        xColumn: "ts",
        queries: [
          queryOf("line"),
          {
            type: "events",
            yColumns: [],
            events: { time: "nope", label: "label" },
          },
        ],
      },
      status: "drawn",
    },
    capped: "drawn",
  },
}

const visualCase = (
  visual: VisualConfig,
  statements: Statement[],
  missingColumns: VisualConfig["columns"],
  over: Partial<DrawCase> = {},
): DrawCase => {
  const spec = VISUAL_CATALOG.find((s) => s.type === visual.type)
  const config = (v: VisualConfig): ChartConfig => ({
    xColumn: null,
    queries: [],
    visual: v,
  })
  return {
    config: config(visual),
    statements,
    missing: {
      config: config({
        ...visual,
        columns: { ...visual.columns, ...missingColumns },
      }),
      status: "refused",
    },
    // As the catalog says.
    capped: spec?.partialResult === "draw" ? "drawn" : "refused",
    ...over,
  }
}

const flow = { from: "src", to: "dst", value: "qty" }
const path = { path: ["region", "desk"], value: "pnl" }
const VISUALS: Record<VisualType, DrawCase> = {
  stat: visualCase({ type: "stat" }, [DESKS], { value: "nope" }),
  gauge: visualCase({ type: "gauge" }, [DESKS], { value: "nope" }),
  bullet: visualCase({ type: "bullet" }, [DESKS], { value: "nope" }),
  // Each side reports for itself: a failed ask query leaves the bids drawn.
  orderBook: visualCase(
    { type: "orderBook" },
    [ASKS, BIDS],
    {
      price: "nope",
    },
    { firstFails: "drawn" },
  ),
  uptime: visualCase({ type: "uptime" }, [STATES], { lane: "nope" }),
  stateTimeline: visualCase({ type: "stateTimeline" }, [STATES], {
    lane: "nope",
  }),
  treemap: visualCase({ type: "treemap", columns: path }, [TREE], {
    path: ["nope"],
  }),
  sunburst: visualCase({ type: "sunburst", columns: path }, [TREE], {
    path: ["nope"],
  }),
  graph: visualCase({ type: "graph", columns: flow }, [FLOWS], {
    from: "nope",
  }),
  sankey: visualCase({ type: "sankey", columns: flow }, [FLOWS], {
    from: "nope",
  }),
  chord: visualCase({ type: "chord", columns: flow }, [FLOWS], {
    from: "nope",
  }),
  map: visualCase({ type: "map" }, [REGIONS], { region: "nope" }),
  liquidityHeatmap: visualCase({ type: "liquidityHeatmap" }, [CELLS], {
    time: "nope",
  }),
  volumeProfile: visualCase({ type: "volumeProfile" }, [LEVELS], {
    price: "nope",
  }),
  footprint: visualCase(
    {
      type: "footprint",
      columns: { time: "ts", price: "lvl", buy: "buy", sell: "sell" },
    },
    [FOOT],
    { time: "nope" },
  ),
  planTree: visualCase({ type: "planTree" }, [PLAN], { text: "nope" }),
}

const custom = (option: Record<string, unknown>): ChartConfig => ({
  xColumn: null,
  queries: [],
  custom: { option },
})
const bars = (y: string) =>
  custom({
    xAxis: { type: "category" },
    yAxis: {},
    series: [{ type: "bar", datasetId: "q0", encode: { x: "desk", y } }],
  })
const treemap = (treePath: string[]) =>
  custom({
    series: [
      {
        type: "treemap",
        data: { $rows: { shape: "tree", path: treePath, value: "pnl" } },
      },
    ],
  })
const CUSTOM: Record<string, DrawCase> = {
  // ECharts draws a dataset-bound series from whatever columns it names:
  // a missing one is a problem in the report on a drawn chart, and a capped
  // result a notice on it.
  "dataset-bound bars": {
    config: bars("pnl"),
    statements: [DESKS],
    missing: { config: bars("nope"), status: "drawn" },
    capped: "drawn",
  },
  // A bound tree needs every row, and a path that is in the result.
  "bound tree": {
    config: treemap(["region", "desk"]),
    statements: [TREE],
    missing: { config: treemap(["nope"]), status: "drawn" },
    capped: "refused",
  },
}

// ── Scenarios ─────────────────────────────────────────────────────────────

const SCENARIOS = [
  "waiting for the SQL debounce",
  "loading",
  "blocked: write SQL",
  "blocked: classification failed",
  "cancelled",
  "statement 0 failed",
  "settled with zero rows",
  "refused: a missing bound column",
  "a row-capped result",
  "drawn",
] as const
type Scenario = (typeof SCENARIOS)[number]

const expectedStatus = (kind: DrawCase, scenario: Scenario): DrawStatus => {
  switch (scenario) {
    case "waiting for the SQL debounce":
    case "loading":
      return "waiting"
    case "blocked: write SQL":
    case "blocked: classification failed":
      return "blocked"
    case "cancelled":
      return "cancelled"
    case "statement 0 failed":
      return kind.firstFails ?? "failed"
    case "settled with zero rows":
      return "empty"
    case "refused: a missing bound column":
      return kind.missing.status
    case "a row-capped result":
      return kind.capped
    case "drawn":
      return "drawn"
  }
}

const sqlOf = (statements: Statement[]) =>
  statements.map((s) => s.query).join(";\n")

const resultOf = (
  statements: Statement[],
  {
    failFirst = false,
    capped = false,
  }: { failFirst?: boolean; capped?: boolean } = {},
): CellResult =>
  ({
    activeResultIndex: 0,
    timestamp: 1,
    results: statements.map(({ query, columns, rows }, i) =>
      failFirst && i === 0
        ? { type: "error", query, error: "table does not exist" }
        : {
            type: "dql",
            query,
            columns,
            dataset: rows,
            count: capped ? rows.length + 1000 : rows.length,
            timestamp: 0,
          },
    ),
  }) as unknown as CellResult

const cellOf = (
  config: ChartConfig,
  statements: Statement[],
  result: CellResult | undefined,
): NotebookCell => ({
  id: CELL_ID,
  position: 0,
  value: sqlOf(statements),
  mode: "draw",
  result,
  chartConfig: config,
})

/** The cell and the engine's state for a kind in a scenario. */
const arrange = (kind: DrawCase, scenario: Scenario): NotebookCell => {
  const { statements } = kind
  const sql = sqlOf(statements)
  Object.assign(engine, {
    sql,
    settled: true,
    classifyBlock: null,
    fetchCancelled: false,
    loading: false,
  })
  const rows = resultOf(statements)
  switch (scenario) {
    case "waiting for the SQL debounce":
      // An edit dropped the result; the engine still holds the old SQL.
      engine.sql = "select 'before the edit'"
      return cellOf(kind.config, statements, undefined)
    case "loading":
      Object.assign(engine, { settled: false, loading: true })
      return cellOf(kind.config, statements, undefined)
    case "blocked: write SQL":
      engine.classifyBlock = { kind: "write", queryType: "INSERT" }
      return cellOf(kind.config, statements, rows)
    case "blocked: classification failed":
      engine.classifyBlock = { kind: "failed", message: "Service Unavailable" }
      return cellOf(kind.config, statements, rows)
    case "cancelled":
      Object.assign(engine, { settled: false, fetchCancelled: true })
      return cellOf(kind.config, statements, undefined)
    case "statement 0 failed":
      return cellOf(
        kind.config,
        statements,
        resultOf(statements, { failFirst: true }),
      )
    case "settled with zero rows":
      return cellOf(
        kind.config,
        statements,
        resultOf(statements.map((s) => ({ ...s, rows: [] }))),
      )
    case "refused: a missing bound column":
      return cellOf(kind.missing.config, statements, rows)
    case "a row-capped result":
      return cellOf(
        kind.config,
        statements,
        resultOf(statements, { capped: true }),
      )
    case "drawn":
      return cellOf(kind.config, statements, rows)
  }
}

// ── Reading the pane ──────────────────────────────────────────────────────

type Pane = "waiting" | "alert" | "text" | "cancelled" | "drawing"

const PANE_OF: Record<DrawStatus, Pane> = {
  waiting: "waiting",
  blocked: "alert",
  failed: "alert",
  empty: "text",
  refused: "text",
  cancelled: "cancelled",
  drawn: "drawing",
}

const DRAWINGS = [
  "echarts-chart",
  "stat-tiles",
  "bullets",
  "order-book",
  "uptime-bars",
  "plan-tree",
]
  .map((hook) => `[data-hook="${hook}"]`)
  .join(", ")

/** What the user sees: the kind of pane, and its sentence. */
const paneOf = (root: HTMLElement): { pane: Pane; text: string } => {
  const cancelled = root.querySelector('[data-hook="draw-canvas-cancelled"]')
  if (cancelled)
    return {
      pane: "cancelled",
      text: cancelled.querySelector("span")?.textContent ?? "",
    }
  if (root.querySelector(DRAWINGS)) return { pane: "drawing", text: "" }
  const waiting = root.querySelector('[data-hook="draw-waiting"]')
  if (waiting && waiting.querySelector("svg"))
    return { pane: "waiting", text: "" }
  const alert = root.querySelector('[role="alert"]')
  if (alert) return { pane: "alert", text: alert.textContent ?? "" }
  const message = root.querySelector('[data-hook="draw-message"]')
  return { pane: "text", text: message?.textContent ?? "" }
}

const NO_ROWS_TEXT = /no rows|no data/i

/** The pane and the report agree, and say what the scenario expects. */
const expectAgreement = (
  root: HTMLElement,
  expected: DrawStatus,
  where: string,
) => {
  const report = getRenderReport(BUFFER_ID, CELL_ID)
  const shown = paneOf(root)
  expect(report, `${where}: no report`).toBeDefined()
  if (!report) return
  const first = report.problems[0]?.message
  // The pane shows what the report says
  expect(shown.pane, `${where}: pane for a ${report.status} report`).toBe(
    PANE_OF[report.status],
  )
  if (shown.pane === "alert" || shown.pane === "text")
    expect(shown.text, `${where}: the pane's sentence`).toBe(first)
  if (shown.pane === "cancelled")
    expect(shown.text, `${where}: the cancelled pane`).toBe(first)
  // "No data to plot." says nothing about why
  expect(root.textContent ?? "").not.toContain("No data to plot.")
  // A failure never reads as no rows
  if (report.status === "failed" || expected === "failed") {
    expect(first, `${where}: failure`).toMatch(/failed|could not load/i)
    expect(shown.text, `${where}: failure`).not.toMatch(NO_ROWS_TEXT)
  }
  // Waiting never reads as empty
  if (report.status === "waiting" || expected === "waiting") {
    expect(report.problems, `${where}: waiting`).toEqual([])
    expect(shown.text, `${where}: waiting`).not.toMatch(NO_ROWS_TEXT)
  }
  // A drawing that reports a failed side shows it
  for (const problem of report.problems)
    if (report.status === "drawn" && /query failed/i.test(problem.message))
      expect(
        Array.from(root.querySelectorAll('[role="alert"]'), (a) =>
          a.textContent?.includes(problem.message.replace(/^\w+ /, "")),
        ),
        `${where}: shown failure`,
      ).toContain(true)
  // A drawn ECharts chart has series
  if (report.status === "drawn") {
    const chart = root.querySelector('[data-hook="echarts-chart"]')
    if (chart)
      expect(Number(chart.getAttribute("data-series")), where).toBeGreaterThan(
        0,
      )
  }
  // And it is the state the scenario puts the cell in
  expect(report.status, `${where}: status`).toBe(expected)
}

const ui = (cell: NotebookCell) => (
  <div style={{ height: 400 }}>
    <DrawCanvas
      cell={cell}
      isFocused={false}
      refreshIntervalMs={undefined}
      onSettingsChange={() => undefined}
      onRetryUnmountWhileFocused={() => undefined}
    />
  </div>
)

const ALL: [string, DrawCase][] = [
  ...Object.entries(PRESETS).map(
    ([type, kind]) => [`${type} chart`, kind] as [string, DrawCase],
  ),
  ...Object.entries(VISUALS).map(
    ([type, kind]) => [`${type} visual`, kind] as [string, DrawCase],
  ),
  ...Object.entries(CUSTOM).map(
    ([name, kind]) => [`custom ${name}`, kind] as [string, DrawCase],
  ),
]

describe("the draw-outcome contract", () => {
  it("has a case for every preset chart type and every visual", () => {
    expect(Object.keys(PRESETS).sort()).toEqual([...CHART_TYPES].sort())
    expect(Object.keys(VISUALS).sort()).toEqual([...VISUAL_TYPES].sort())
    expect(VISUAL_CATALOG.map((s) => s.type).sort()).toEqual(
      [...VISUAL_TYPES].sort(),
    )
  })

  describe.each(ALL)("%s", (name, kind) => {
    it.each(SCENARIOS)("pane and report agree: %s", (scenario) => {
      const { container } = renderComponent(ui(arrange(kind, scenario)))
      expectAgreement(
        container,
        expectedStatus(kind, scenario),
        `${name}, ${scenario}`,
      )
    })

    it("the report follows the pane through changes of state", () => {
      const steps: Scenario[] = [
        "drawn",
        "settled with zero rows",
        "drawn",
        "blocked: write SQL",
        "drawn",
        "blocked: classification failed",
        "drawn",
        "loading",
        "drawn",
        "statement 0 failed",
      ]
      const { container, rerender } = renderComponent(
        ui(arrange(kind, "drawn")),
      )
      let previous = arrange(kind, "drawn")
      for (const [i, step] of steps.entries()) {
        const next = arrange(kind, step)
        // A block or its end leaves the rows as they are: the same cell.
        const same =
          step.startsWith("blocked") ||
          (step === "drawn" && steps[i - 1]?.startsWith("blocked"))
        act(() => {
          rerender(ui(same ? previous : next))
        })
        if (!same) previous = next
        expectAgreement(
          container,
          expectedStatus(kind, step),
          `${name}, step ${i + 1} (${step})`,
        )
      }
    })
  })

  describe.each([
    ["map visual", VISUALS.map],
    [
      "custom map",
      {
        ...CUSTOM["dataset-bound bars"],
        config: custom({
          series: [
            {
              type: "map",
              map: "world",
              data: {
                $rows: { shape: "items", name: "country", value: "trades" },
              },
            },
          ],
        }),
        statements: [REGIONS],
      },
    ],
  ] as [string, DrawCase][])("%s", (name, kind) => {
    it.each([
      ["loading", "waiting"],
      ["error", "failed"],
      ["ready", "drawn"],
    ] as const)("agrees on a world map %s", (status, expected) => {
      maps.status = status
      const { container } = renderComponent(ui(arrange(kind, "drawn")))
      return vi.waitFor(() =>
        expectAgreement(container, expected, `${name}, map ${status}`),
      )
    })
  })
})
