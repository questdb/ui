import { describe, expect, it } from "vitest"
import { lightColors } from "../../../theme"
import type { ColumnDefinition } from "../../../utils/questdb/types"
import {
  CHART_TYPES,
  VISUAL_TYPES,
  type ChartType,
  type VisualConfig,
  type VisualType,
} from "./CellChart/chartTypes"
import {
  buildEchartsOption,
  type ResolvedQuery,
} from "./CellChart/buildEchartsOption"
import { prepareCustomOption } from "./customChart/prepareCustomOption"
import { visualDraw } from "./visuals/visualOutcome"
import type { StatementRows } from "./visuals/statementRows"

// A data-size budget for every drawing that turns rows into something drawn:
// each preset chart type, each visual and each custom-option row binding is
// fed rows at the worst cardinality it allows (many categories, partitions,
// lanes, states, nodes, levels, buckets) and checked two ways, with no clock:
//
// - its output (the ECharts option, or the visual's read) holds at most
//   `a × rows + b` values, counting array elements and leaf primitives;
// - the reads of the rows grow linearly: the rows and each row are Proxies
//   counting index reads, and going from N to 4N rows may at most multiply
//   the reads (and the output) by 6 (linear is about 4, quadratic 16).
//
// Each budget's `a` is about twice today's per-row value, given beside it.

// ── Rows ───────────────────────────────────────────────────────────────────

type Statement = { columns: ColumnDefinition[]; rows: unknown[][] }
type Rand = () => number

// mulberry32: the same rows on every run.
const seeded = (seed: number): Rand => {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const int = (rand: Rand, below: number) => Math.floor(rand() * below)
const num = (rand: Rand) => Math.round(rand() * 1e6) / 100

const T0 = Date.UTC(2024, 0, 1)
const ts = (minute: number) =>
  new Date(T0 + minute * 60_000).toISOString().replace("Z", "000Z")

const statement = (
  columns: [string, string][],
  rows: unknown[][],
): Statement => ({
  columns: columns.map(([name, type]) => ({ name, type })),
  rows,
})

const times = (n: number, f: (i: number) => unknown[]) =>
  Array.from({ length: n }, (_, i) => f(i))

// ── Counting ───────────────────────────────────────────────────────────────

let reads = 0
let counting = false
const INDEX = /^\d+$/

const counted = <T extends object>(target: T): T =>
  new Proxy(target, {
    get(t, key, receiver) {
      if (counting && typeof key === "string" && INDEX.test(key)) reads += 1
      return Reflect.get(t, key, receiver) as unknown
    },
  })

const watched = (statements: Statement[]): StatementRows[] =>
  statements.map((s) => ({
    columns: s.columns,
    rows: counted(s.rows.map((row) => counted(row))) as StatementRows["rows"],
  }))

/** Array elements plus leaf primitives, each object counted once. */
const countValues = (root: unknown): number => {
  let count = 0
  const seen = new Set<object>()
  const stack: unknown[] = [root]
  while (stack.length > 0) {
    const value = stack.pop()
    if (typeof value === "object" && value !== null) {
      if (seen.has(value)) continue
      seen.add(value)
      if (Array.isArray(value)) {
        count += value.length
        for (const v of value) stack.push(v)
      } else for (const v of Object.values(value)) stack.push(v)
    } else count += 1
  }
  return count
}

// ── Cases ──────────────────────────────────────────────────────────────────

type Case = {
  name: string
  // Statements for `n` rows; `n` counts the rows of every statement drawn.
  rows: (n: number, rand: Rand) => Statement[]
  // The drawing, which throws (a failed expect) when nothing is drawn.
  draw: (statements: StatementRows[]) => unknown
  // The output may hold `a × rows + b` values.
  budget: [a: number, b: number]
  // Row counts compared; the second is four times the first.
  sizes?: [number, number]
}

const SIZES: [number, number] = [1_000, 4_000]

const run = (c: Case, n: number) => {
  const statements = c.rows(n, seeded(n))
  const rowCount = statements.reduce((k, s) => k + s.rows.length, 0)
  const input = watched(statements)
  reads = 0
  counting = true
  let output: unknown
  try {
    output = c.draw(input)
  } finally {
    counting = false
  }
  return { rowCount, reads, values: countValues(output) }
}

// How many times the larger run's count is the smaller's; a count that
// stays 0 does not grow.
const growth = (small: number, large: number) =>
  small === 0 ? (large === 0 ? 1 : Infinity) : large / small

const check = (c: Case) => {
  const [small, large] = (c.sizes ?? SIZES).map((n) => run(c, n))
  const [a, b] = c.budget
  if (process.env.DATA_BUDGET_REPORT)
    console.info(
      `${c.name}: ${small.values} values from ${small.rowCount} rows, ${large.values} from ${large.rowCount}; reads ×${growth(small.reads, large.reads).toFixed(2)}`,
    )
  for (const r of [small, large])
    expect(r.values, "values over budget").toBeLessThanOrEqual(
      a * r.rowCount + b,
    )
  expect(
    growth(small.reads, large.reads),
    "row reads grow",
  ).toBeLessThanOrEqual(6)
  expect(
    growth(small.values, large.values),
    "output grows",
  ).toBeLessThanOrEqual(6)
}

// ── Preset charts ──────────────────────────────────────────────────────────

const PARTITIONS = 30 // MAX_PARTITION_SERIES

const chartContext = {
  colors: lightColors,
  formats: {},
  clickEnabled: true,
}

const query = (
  s: StatementRows,
  over: Partial<ResolvedQuery> & Pick<ResolvedQuery, "type" | "xColumn">,
): ResolvedQuery => ({
  index: 0,
  columns: s.columns,
  dataset: s.rows as ResolvedQuery["dataset"],
  yColumns: [],
  axis: "left",
  ...over,
})

const drawnSeries = (option: unknown) => {
  const series = (option as { series?: unknown }).series
  const list = (Array.isArray(series) ? series : [series]) as {
    data?: unknown[]
  }[]
  expect(list.some((s) => (s?.data?.length ?? 0) > 0)).toBe(true)
  return option
}

// The first statement is the chart's; any others are its events.
const preset =
  (over: Partial<ResolvedQuery> & Pick<ResolvedQuery, "type">) =>
  ([s, ...rest]: StatementRows[]) =>
    drawnSeries(
      buildEchartsOption(
        {
          xColumn: "x",
          events: rest.map((e, i) => ({
            index: i + 1,
            columns: e.columns,
            dataset: e.rows as ResolvedQuery["dataset"],
            columnsRole: {
              time: "ts",
              end: "end",
              label: "label",
              tone: "tone",
            },
          })),
        },
        [query(s, { xColumn: "x", ...over })],
        chartContext,
      ),
    )

// Rows of 30 partitions at shared times: n / 30 times.
const timePartitions = (n: number, rand: Rand) => [
  statement(
    [
      ["x", "TIMESTAMP"],
      ["sym", "SYMBOL"],
      ["y1", "DOUBLE"],
      ["y2", "DOUBLE"],
    ],
    times(n, (i) => [
      ts(Math.floor(i / PARTITIONS)),
      `s${i % PARTITIONS}`,
      num(rand),
      num(rand),
    ]),
  ),
]

// Rows of 30 partitions over n / 2 categories, in no order.
const categoryPartitions = (n: number, rand: Rand) => [
  statement(
    [
      ["x", "STRING"],
      ["sym", "SYMBOL"],
      ["y1", "DOUBLE"],
    ],
    times(n, () => [
      `c${int(rand, n / 2)}`,
      `s${int(rand, PARTITIONS)}`,
      num(rand),
    ]),
  ),
]

// Rows of 30 partitions, each at a time of its own.
const sparsePartitions = (n: number, rand: Rand) => [
  statement(
    [
      ["x", "TIMESTAMP"],
      ["sym", "SYMBOL"],
      ["y1", "DOUBLE"],
    ],
    times(n, (i) => [ts(i), `s${i % PARTITIONS}`, num(rand)]),
  ),
]

const seriesCases = (type: ChartType, stacks: boolean): Case[] => [
  {
    name: `${type}: 30 partitions × 2 columns over time`,
    rows: timePartitions,
    draw: preset({ type, partitionByColumn: "sym", yColumns: ["y1", "y2"] }),
    // today 18 a row + 320 to 560
    budget: [32, 1_200],
  },
  {
    name: `${type}: 30 partitions over n/2 categories`,
    rows: categoryPartitions,
    draw: preset({ type, partitionByColumn: "sym", yColumns: ["y1"] }),
    // today 30.7 a row + 800 to 920: each partition holds a slot per category
    budget: [55, 2_000],
  },
  ...(stacks
    ? [
        {
          name: `${type}: 100% stack of 30 partitions over time`,
          rows: timePartitions,
          draw: preset({
            type,
            partitionByColumn: "sym",
            yColumns: ["y1"],
            percentStack: true,
          }),
          // today 9 a row + 330 to 450
          budget: [16, 1_000] as [number, number],
        },
        {
          // Every row its own time: 30 slots a row, up to the stack's
          // 40,000 (MAX_PERCENT_STACK_SLOTS), so 1,200 rows at most.
          name: `${type}: 100% stack of 30 partitions, a time per row`,
          rows: sparsePartitions,
          draw: preset({
            type,
            partitionByColumn: "sym",
            yColumns: ["y1"],
            percentStack: true,
          }),
          // today 154 a row + 320: each partition holds a slot, [x, null]
          // where it has no row, at every time; 30 slots a row
          budget: [270, 2_000] as [number, number],
          sizes: [300, 1_200] as [number, number],
        },
      ]
    : []),
]

const PRESET_CASES: Record<ChartType, Case[]> = {
  line: seriesCases("line", false),
  area: seriesCases("area", true),
  stepLine: seriesCases("stepLine", false),
  stepArea: seriesCases("stepArea", true),
  bar: seriesCases("bar", false),
  stackedBar: seriesCases("stackedBar", true),
  scatter: [
    ...seriesCases("scatter", false),
    {
      name: "scatter: sized and coloured points",
      rows: (n, rand) => [
        statement(
          [
            ["x", "DOUBLE"],
            ["y", "DOUBLE"],
            ["size", "DOUBLE"],
            ["color", "DOUBLE"],
          ],
          times(n, () => [num(rand), num(rand), num(rand), num(rand)]),
        ),
      ],
      draw: preset({
        type: "scatter",
        yColumns: ["y"],
        scatter: { size: "size", color: "color" },
      }),
      // today 13 a row + 66
      budget: [24, 200],
    },
  ],
  pie: [
    {
      name: "pie: a slice per row",
      rows: (n, rand) => [
        statement(
          [
            ["x", "STRING"],
            ["v", "DOUBLE"],
          ],
          times(n, (i) => [`slice ${i}`, num(rand)]),
        ),
      ],
      draw: preset({ type: "pie", yColumns: ["v"], pieShape: "donut" }),
      // today 7 a row + 18
      budget: [12, 100],
    },
  ],
  candlestick: [
    {
      name: "candlestick: a candle per row",
      rows: (n, rand) => [
        statement(
          [
            ["x", "TIMESTAMP"],
            ["o", "DOUBLE"],
            ["h", "DOUBLE"],
            ["l", "DOUBLE"],
            ["c", "DOUBLE"],
          ],
          times(n, (i) => [ts(i), num(rand), num(rand), num(rand), num(rand)]),
        ),
      ],
      draw: preset({
        type: "candlestick",
        yColumns: [],
        ohlc: { open: "o", high: "h", low: "l", close: "c" },
      }),
      // today 15 a row + 24
      budget: [26, 100],
    },
  ],
  heatmap: [
    {
      name: "heatmap: n/2 × n/2 sparse cells",
      rows: (n, rand) => [
        statement(
          [
            ["x", "STRING"],
            ["y", "STRING"],
            ["v", "DOUBLE"],
          ],
          times(n, () => [
            `x${int(rand, n / 2)}`,
            `y${int(rand, n / 2)}`,
            num(rand),
          ]),
        ),
      ],
      draw: preset({ type: "heatmap", roles: { y: "y", value: "v" } }),
      // today 13.7 a row + 64
      budget: [24, 200],
    },
  ],
  band: [
    {
      name: "band: an edge pair and a line per row",
      rows: (n, rand) => [
        statement(
          [
            ["x", "TIMESTAMP"],
            ["lo", "DOUBLE"],
            ["hi", "DOUBLE"],
            ["y", "DOUBLE"],
          ],
          times(n, (i) => [ts(i), num(rand), num(rand), num(rand)]),
        ),
      ],
      draw: preset({
        type: "band",
        yColumns: ["y"],
        roles: { lower: "lo", upper: "hi" },
      }),
      // today 20 a row + 49
      budget: [35, 100],
    },
  ],
  rangeBar: [
    {
      name: "rangeBar: a bar per category",
      rows: (n, rand) => [
        statement(
          [
            ["x", "STRING"],
            ["start", "DOUBLE"],
            ["end", "DOUBLE"],
          ],
          times(n, (i) => {
            const start = num(rand)
            return [`c${i}`, start, start + num(rand)]
          }),
        ),
      ],
      draw: preset({ type: "rangeBar", roles: { start: "start", end: "end" } }),
      // today 13 a row + 43
      budget: [23, 100],
    },
    {
      name: "rangeBar: a Gantt of n/4 lanes",
      rows: (n, rand) => [
        statement(
          [
            ["x", "STRING"],
            ["start", "TIMESTAMP"],
            ["end", "TIMESTAMP"],
          ],
          times(n, (i) => [
            `lane ${int(rand, n / 4)}`,
            ts(i),
            ts(i + 1 + int(rand, 30)),
          ]),
        ),
      ],
      draw: preset({ type: "rangeBar", roles: { start: "start", end: "end" } }),
      // today 11.5 a row + 29
      budget: [20, 100],
    },
  ],
  boxplot: [
    {
      name: "boxplot: a box per category",
      rows: (n, rand) => [
        statement(
          [
            ["x", "STRING"],
            ["min", "DOUBLE"],
            ["q1", "DOUBLE"],
            ["median", "DOUBLE"],
            ["q3", "DOUBLE"],
            ["max", "DOUBLE"],
          ],
          times(n, (i) => {
            const base = num(rand)
            return [`c${i}`, base, base + 1, base + 2, base + 3, base + 4]
          }),
        ),
      ],
      draw: preset({
        type: "boxplot",
        roles: { min: "min", q1: "q1", median: "median", q3: "q3", max: "max" },
      }),
      // today 17 a row + 31
      budget: [30, 100],
    },
  ],
  events: [
    {
      name: "events: n/2 ranges over a line of n/2 points",
      rows: (n, rand) => [
        statement(
          [
            ["x", "TIMESTAMP"],
            ["y", "DOUBLE"],
          ],
          times(n / 2, (i) => [ts(i), num(rand)]),
        ),
        statement(
          [
            ["ts", "TIMESTAMP"],
            ["end", "TIMESTAMP"],
            ["label", "STRING"],
            ["tone", "SYMBOL"],
          ],
          times(n / 2, (i) => [
            ts(i),
            ts(i + 1 + int(rand, 10)),
            `event ${i}`,
            ["positive", "warning", "negative"][i % 3],
          ]),
        ),
      ],
      draw: preset({ type: "line", yColumns: ["y"] }),
      // today 9.5 a row + 38
      budget: [17, 100],
    },
  ],
}

// ── Visuals ────────────────────────────────────────────────────────────────

const visual =
  (config: VisualConfig) =>
  (statements: StatementRows[]): unknown => {
    const { outcome, read } = visualDraw({
      visual: config,
      statements,
      mapStatus: "ready",
      colors: lightColors,
      formats: {},
    })
    expect(outcome.status, outcome.message).toBe("drawn")
    return read
  }

const states = (n: number, rand: Rand) => [
  statement(
    [
      ["ts", "TIMESTAMP"],
      ["lane", "SYMBOL"],
      ["state", "SYMBOL"],
    ],
    // n / 10 lanes and n / 50 states, in time order.
    times(n, (i) => [
      ts(i),
      `lane ${int(rand, n / 10)}`,
      `state ${int(rand, n / 50)}`,
    ]),
  ),
]

// A tree four levels deep: 8 roots, then n/64, n/16 and n/4 wide.
const tree = (n: number, rand: Rand) => [
  statement(
    [
      ["a", "SYMBOL"],
      ["b", "SYMBOL"],
      ["c", "STRING"],
      ["d", "STRING"],
      ["v", "DOUBLE"],
      ["chg", "DOUBLE"],
    ],
    times(n, (i) => [
      `a${i % 8}`,
      `b${Math.floor(i / 64)}`,
      `c${Math.floor(i / 16)}`,
      `d${Math.floor(i / 4)}`,
      num(rand),
      rand() - 0.5,
    ]),
  ),
]

// n links between n/2 nodes, each from a lower to a higher node (no cycle).
const flows = (n: number, rand: Rand) => [
  statement(
    [
      ["from", "SYMBOL"],
      ["to", "SYMBOL"],
      ["v", "DOUBLE"],
    ],
    times(n, (i) => {
      const from = i % (n / 2 - 1)
      return [
        `n${from}`,
        `n${from + 1 + int(rand, n / 2 - from - 1)}`,
        num(rand),
      ]
    }),
  ),
]

// Price levels drifting with time: `levels` per bucket.
const priceBuckets = (buckets: number, levels: number, rand: Rand) => {
  const rows: unknown[][] = []
  let base = 1000
  for (let b = 0; b < buckets; b++) {
    base += int(rand, 7) - 3
    for (let l = 0; l < levels; l++) rows.push([ts(b), base + l, num(rand)])
  }
  return rows
}

const flowVisual = (
  type: VisualType,
  budget: [number, number],
  sizes?: [number, number],
): Case[] => [
  {
    name: `${type}: n links between n/2 nodes`,
    rows: flows,
    draw: visual({ type }),
    budget,
    ...(sizes ? { sizes } : {}),
  },
]

const VISUAL_CASES: Record<VisualType, Case[]> = {
  stat: [
    {
      name: "stat: n/2 tiles and an n/2 point sparkline",
      rows: (n, rand) => [
        statement(
          [
            ["v", "DOUBLE"],
            ["label", "STRING"],
            ["change", "DOUBLE"],
          ],
          times(n / 2, (i) => [num(rand), `tile ${i}`, rand() - 0.5]),
        ),
        statement(
          [
            ["ts", "TIMESTAMP"],
            ["v", "DOUBLE"],
          ],
          times(n / 2, (i) => [ts(i), num(rand)]),
        ),
      ],
      draw: visual({ type: "stat", sparklineQuery: 1 }),
      // today 1 a row + 220: 24 tiles at most, the sparkline a point a row
      budget: [2, 500],
    },
  ],
  gauge: [
    {
      name: "gauge: the first of n rows",
      rows: (n, rand) => [
        statement(
          [
            ["v", "DOUBLE"],
            ["label", "STRING"],
          ],
          times(n, (i) => [num(rand), `row ${i}`]),
        ),
      ],
      draw: visual({ type: "gauge" }),
      // today 0 a row + 76: the first row only
      budget: [0, 200],
    },
  ],
  bullet: [
    {
      name: "bullet: a bar per row",
      rows: (n, rand) => [
        statement(
          [
            ["label", "STRING"],
            ["v", "DOUBLE"],
            ["target", "DOUBLE"],
          ],
          times(n, (i) => [`bar ${i}`, num(rand), num(rand)]),
        ),
      ],
      // The read passes the rows on as they are, unread (the component
      // reads them as it draws): no reads to count, and its output is the
      // rows themselves.
      draw: visual({ type: "bullet" }),
      // today 7 a row + 13
      budget: [12, 100],
    },
  ],
  orderBook: [
    {
      name: "orderBook: n/2 price levels a side",
      rows: (n, rand) => [
        statement(
          [
            ["price", "DOUBLE"],
            ["size", "DOUBLE"],
          ],
          times(n / 2, (i) => [1000 + i / 100, num(rand)]),
        ),
        statement(
          [
            ["price", "DOUBLE"],
            ["size", "DOUBLE"],
          ],
          times(n / 2, (i) => [999 - i / 100, num(rand)]),
        ),
      ],
      draw: visual({ type: "orderBook" }),
      // today 10 a row + 5
      budget: [18, 100],
    },
  ],
  stateTimeline: [
    {
      name: "stateTimeline: n/10 lanes of n/50 states",
      rows: states,
      draw: visual({ type: "stateTimeline" }),
      // today 13.4 a row + 16
      budget: [24, 100],
    },
  ],
  uptime: [
    {
      name: "uptime: n/10 lanes of n/50 states",
      rows: states,
      draw: visual({ type: "uptime" }),
      // today 6.2 a row + 4
      budget: [11, 100],
    },
  ],
  treemap: [
    {
      name: "treemap: four levels, n/4 wide",
      rows: tree,
      draw: visual({
        type: "treemap",
        columns: { path: ["a", "b", "c", "d"], value: "v", change: "chg" },
      }),
      // today 19.1 a row + 153
      budget: [34, 400],
    },
  ],
  sunburst: [
    {
      name: "sunburst: four levels, n/4 wide",
      rows: tree,
      draw: visual({
        type: "sunburst",
        columns: { path: ["a", "b", "c", "d"], value: "v", change: "chg" },
      }),
      // today 19.1 a row + 115
      budget: [34, 400],
    },
  ],
  // today 13 a row + 53
  graph: flowVisual("graph", [23, 200]),
  // A Sankey draws up to 2,000 links (MAX_SANKEY_LINKS).
  // today 11.5 a row + 39
  sankey: flowVisual("sankey", [20, 100], [500, 2_000]),
  // today 11.5 a row + 40
  chord: flowVisual("chord", [20, 100]),
  map: [
    {
      name: "map: a point per row",
      rows: (n, rand) => [
        statement(
          [
            ["lat", "DOUBLE"],
            ["lon", "DOUBLE"],
            ["v", "DOUBLE"],
            ["name", "STRING"],
          ],
          times(n, (i) => [
            rand() * 160 - 80,
            rand() * 360 - 180,
            num(rand),
            `point ${i}`,
          ]),
        ),
      ],
      draw: visual({ type: "map" }),
      // today 12 a row + 19
      budget: [21, 100],
    },
    {
      name: "map: a region per row",
      rows: (n, rand) => [
        statement(
          [
            ["region", "STRING"],
            ["v", "DOUBLE"],
          ],
          times(n, (i) => [`region ${i}`, num(rand)]),
        ),
      ],
      draw: visual({ type: "map" }),
      // today 7 a row + 29
      budget: [12, 100],
    },
  ],
  liquidityHeatmap: [
    {
      name: "liquidityHeatmap: n/40 times × 40 drifting price levels",
      rows: (n, rand) => {
        const cells = priceBuckets(n / 40, 39, rand)
        return [
          statement(
            [
              ["ts", "TIMESTAMP"],
              ["price", "DOUBLE"],
              ["v", "DOUBLE"],
            ],
            cells,
          ),
          statement(
            [
              ["ts", "TIMESTAMP"],
              ["price", "DOUBLE"],
            ],
            times(n / 40, (i) => [ts(i), 1000 + int(rand, 40)]),
          ),
        ]
      },
      draw: visual({ type: "liquidityHeatmap" }),
      // today 11 a row + 52
      budget: [19, 200],
    },
  ],
  volumeProfile: [
    {
      name: "volumeProfile: a price level per row",
      rows: (n, rand) => [
        statement(
          [
            ["price", "DOUBLE"],
            ["buy", "DOUBLE"],
            ["sell", "DOUBLE"],
          ],
          times(n, (i) => [1000 + i / 100, num(rand), num(rand)]),
        ),
      ],
      draw: visual({ type: "volumeProfile" }),
      // today 14 a row + 41
      budget: [24, 100],
    },
  ],
  footprint: [
    {
      name: "footprint: n/40 bars × 40 drifting price levels",
      rows: (n, rand) => {
        const cells = priceBuckets(n / 40, 39, rand).map(([t, p]) => [
          t,
          p,
          num(rand),
          num(rand),
        ])
        return [
          statement(
            [
              ["ts", "TIMESTAMP"],
              ["price", "DOUBLE"],
              ["buy", "DOUBLE"],
              ["sell", "DOUBLE"],
            ],
            cells,
          ),
          statement(
            [
              ["ts", "TIMESTAMP"],
              ["open", "DOUBLE"],
              ["high", "DOUBLE"],
              ["low", "DOUBLE"],
              ["close", "DOUBLE"],
            ],
            times(n / 40, (i) => [ts(i), 1010, 1030, 1000, 1020]),
          ),
        ]
      },
      draw: visual({ type: "footprint" }),
      // today 15.9 a row + 52
      budget: [28, 200],
    },
  ],
  planTree: [
    {
      name: "planTree: n operators, up to 32 deep",
      rows: (n) => [
        statement(
          [["text", "STRING"]],
          times(n, (i) =>
            i % 5 === 4
              ? [`${" ".repeat(2 * (i % 32) + 2)}filter: ${i}<price`]
              : [`${" ".repeat(2 * (i % 32))}Operator ${i}`],
          ),
        ),
      ],
      draw: visual({ type: "planTree" }),
      // today 3 a row + 1
      budget: [6, 100],
    },
  ],
}

// ── Custom options ─────────────────────────────────────────────────────────

const SHAPES = [
  "tuples",
  "column",
  "value",
  "items",
  "tree",
  "links",
  "nodes",
  "lines",
] as const
type Shape = (typeof SHAPES)[number]

// Every custom option also carries each statement's rows as a dataset (a
// copy of every row), so each case's output holds that as well.
const custom =
  (option: Record<string, unknown>) =>
  (statements: StatementRows[]): unknown => {
    const { sanitized, built } = prepareCustomOption(option, {
      colors: lightColors,
      statements,
      live: false,
      pickable: true,
    })
    const problems = [...sanitized.problems, ...built.problems]
    expect(problems.filter((p) => p.severity === "error")).toEqual([])
    expect(Object.keys(built.option).length).toBeGreaterThan(0)
    return built.option
  }

const rows = (spec: Record<string, unknown>) => ({ $rows: spec })

const xy = (n: number, rand: Rand) => [
  statement(
    [
      ["x", "TIMESTAMP"],
      ["y", "DOUBLE"],
      ["name", "STRING"],
    ],
    times(n, (i) => [ts(i), num(rand), `item ${i}`]),
  ),
]

const CUSTOM_CASES: Record<Shape | "dataset", Case> = {
  tuples: {
    name: "custom $rows tuples",
    rows: xy,
    draw: custom({
      xAxis: { type: "time" },
      yAxis: {},
      series: [
        { type: "line", data: rows({ shape: "tuples", columns: ["x", "y"] }) },
      ],
    }),
    // today 16 a row + 18
    budget: [28, 100],
  },
  column: {
    name: "custom $rows column",
    rows: xy,
    draw: custom({
      xAxis: { type: "category" },
      yAxis: {},
      series: [{ type: "bar", data: rows({ shape: "column", column: "y" }) }],
    }),
    // today 12 a row + 18
    budget: [21, 100],
  },
  value: {
    name: "custom $rows value",
    rows: xy,
    draw: custom({
      series: [
        {
          type: "gauge",
          data: [{ value: rows({ shape: "value", column: "y" }) }],
        },
      ],
    }),
    // today 7 a row + 19: the dataset copy of every row
    budget: [12, 100],
  },
  items: {
    name: "custom $rows items",
    rows: xy,
    draw: custom({
      series: [
        {
          type: "pie",
          data: rows({ shape: "items", name: "name", value: "y" }),
        },
      ],
    }),
    // today 14 a row + 17
    budget: [24, 100],
  },
  tree: {
    name: "custom $rows tree, four levels",
    rows: tree,
    draw: custom({
      series: [
        {
          type: "treemap",
          data: rows({
            shape: "tree",
            path: ["a", "b", "c", "d"],
            value: "v",
            color: "chg",
          }),
        },
      ],
    }),
    // today 32.1 a row + 106
    budget: [56, 400],
  },
  links: {
    name: "custom $rows links, n between n/2 nodes",
    rows: flows,
    draw: custom({
      series: [
        {
          type: "graph",
          data: rows({ shape: "nodes", source: "from", target: "to" }),
          links: rows({
            shape: "links",
            source: "from",
            target: "to",
            value: "v",
          }),
        },
      ],
    }),
    // today 18 a row + 41
    budget: [32, 100],
  },
  nodes: {
    name: "custom $rows nodes of n links",
    rows: flows,
    draw: custom({
      series: [
        {
          type: "graph",
          data: rows({ shape: "nodes", source: "from", target: "to" }),
        },
      ],
    }),
    // today 11 a row + 41
    budget: [19, 100],
  },
  lines: {
    name: "custom $rows lines",
    rows: (n, rand) => [
      statement(
        [
          ["lon1", "DOUBLE"],
          ["lat1", "DOUBLE"],
          ["lon2", "DOUBLE"],
          ["lat2", "DOUBLE"],
          ["name", "STRING"],
          ["v", "DOUBLE"],
        ],
        times(n, (i) => [
          rand() * 360 - 180,
          rand() * 160 - 80,
          rand() * 360 - 180,
          rand() * 160 - 80,
          `route ${i}`,
          num(rand),
        ]),
      ),
    ],
    draw: custom({
      geo: { map: "world" },
      series: [
        {
          type: "lines",
          coordinateSystem: "geo",
          data: rows({
            shape: "lines",
            columns: ["lon1", "lat1", "lon2", "lat2"],
            name: "name",
            value: "v",
          }),
        },
      ],
    }),
    // today 30 a row + 28
    budget: [52, 100],
  },
  dataset: {
    name: "custom dataset-bound series",
    // The rows are copied into the dataset in one pass; ECharts reads that
    // copy when it draws, outside this test. So the reads see the copy only,
    // and the output size is what checks this case.
    rows: xy,
    draw: custom({
      xAxis: { type: "category" },
      yAxis: {},
      series: [{ type: "bar", encode: { x: "name", y: "y" } }],
    }),
    // today 7 a row + 20
    budget: [12, 100],
  },
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("data-size budget", () => {
  describe.each(CHART_TYPES.map((type) => [type]))("preset %s", (type) => {
    const cases = PRESET_CASES[type]
    it("has cases", () => expect(cases.length).toBeGreaterThan(0))
    it.each(cases.map((c) => [c.name, c]))("%s", (_, c) => check(c))
  })

  describe.each(VISUAL_TYPES.map((type) => [type]))("visual %s", (type) => {
    const cases = VISUAL_CASES[type]
    it("has cases", () => expect(cases.length).toBeGreaterThan(0))
    it.each(cases.map((c) => [c.name, c]))("%s", (_, c) => check(c))
  })

  it("covers every $rows shape", () => {
    const { built } = prepareCustomOption(
      { series: [{ type: "bar", data: rows({ shape: "?" }) }] },
      {
        colors: lightColors,
        statements: [{ columns: [], rows: [] }],
        live: false,
      },
    )
    const listed = /use (.*)\.$/m
      .exec(built.problems.map((p) => p.message).join("\n"))?.[1]
      .split(/, | or /)
    expect(listed).toEqual([...SHAPES])
  })

  it.each(Object.values(CUSTOM_CASES).map((c) => [c.name, c]))("%s", (_, c) =>
    check(c),
  )
})
