import type { VisualColumns, VisualType } from "../CellChart/chartTypes"

// What each component reads, for the settings drawer: the query shape it
// expects, the column roles with the column each falls back to, and its
// options. The fallbacks describe what the visual's builder does when a role
// is unset; keep them in step with the builders in this folder.

export type RoleKind = "numeric" | "categorical" | "temporal" | "any"

export type RoleSpec = {
  role: Exclude<keyof VisualColumns, "path">
  label: string
  accepts: RoleKind
  // What is used when the role is unset.
  fallback: string
  // A role that can be left empty: "None" instead of a default column.
  optional?: boolean
}

export type VisualOption = "range" | "sparkline" | "buckets" | "severity"

export type VisualSpec = {
  type: VisualType
  label: string
  // The query shape, in a sentence.
  shape: string
  roles: RoleSpec[]
  // Text columns from outer to inner level (treemap, sunburst).
  path?: boolean
  options: VisualOption[]
}

const value = (fallback = "First numeric column"): RoleSpec => ({
  role: "value",
  label: "Value",
  accepts: "numeric",
  fallback,
})

const label = (fallback = "First text column"): RoleSpec => ({
  role: "label",
  label: "Label",
  accepts: "categorical",
  fallback,
})

const stateRoles: RoleSpec[] = [
  {
    role: "time",
    label: "Time",
    accepts: "temporal",
    fallback: "First timestamp column",
  },
  {
    role: "lane",
    label: "Lane",
    accepts: "categorical",
    fallback: "First text column",
  },
  {
    role: "state",
    label: "State",
    accepts: "any",
    fallback: "The next remaining column",
  },
  {
    role: "end",
    label: "End",
    accepts: "temporal",
    fallback: "The lane's next row",
    optional: true,
  },
]

const flowRoles: RoleSpec[] = [
  { role: "from", label: "From", accepts: "categorical", fallback: "Column 1" },
  { role: "to", label: "To", accepts: "categorical", fallback: "Column 2" },
  value("Column 3"),
]

export const VISUAL_CATALOG: VisualSpec[] = [
  {
    type: "stat",
    label: "Stat tiles",
    shape:
      "One tile per row of the first statement: a value with its label, and optionally a change and a line of context.",
    roles: [
      value(),
      label(),
      {
        role: "change",
        label: "Change (a fraction, 0.012 = +1.2%)",
        accepts: "numeric",
        fallback: "A column named change",
        optional: true,
      },
      {
        role: "caption",
        label: "Caption",
        accepts: "any",
        fallback: "None",
        optional: true,
      },
    ],
    options: ["sparkline"],
  },
  {
    type: "gauge",
    label: "Gauge",
    shape:
      "The first row's value on a scale. Colour bands come from the value column's format thresholds.",
    roles: [value(), { ...label("None"), optional: true }],
    options: ["range"],
  },
  {
    type: "bullet",
    label: "Bullet bars",
    shape:
      "One bar per row: a value against its target, such as usage against a limit.",
    roles: [
      label(),
      value(),
      {
        role: "target",
        label: "Target",
        accepts: "numeric",
        fallback: "A column named target, limit, budget or max",
        optional: true,
      },
    ],
    options: ["range"],
  },
  {
    type: "orderBook",
    label: "Order book",
    shape:
      "Statement 1 returns the asks, best first; statement 2 the bids, best first. A third column is shown as is.",
    roles: [
      {
        role: "price",
        label: "Price",
        accepts: "numeric",
        fallback: "Column 1",
      },
      { role: "size", label: "Size", accepts: "numeric", fallback: "Column 2" },
    ],
    options: [],
  },
  {
    type: "uptime",
    label: "Uptime bars (status page)",
    shape:
      "Rows of time, lane and state. Each lane shows its current state, bars coloured by the worst state in each slice of time, and its uptime.",
    roles: stateRoles,
    options: ["buckets", "severity"],
  },
  {
    type: "stateTimeline",
    label: "State timeline",
    shape: "Rows of time, lane and state, drawn as coloured bands per lane.",
    roles: stateRoles,
    options: ["severity"],
  },
  {
    type: "treemap",
    label: "Treemap",
    shape:
      "Text columns from the outer to the inner level, and a value that sizes each leaf.",
    roles: [
      value(),
      {
        role: "change",
        label: "Colour by (diverging, red to green)",
        accepts: "numeric",
        fallback: "None",
        optional: true,
      },
    ],
    path: true,
    options: [],
  },
  {
    type: "sunburst",
    label: "Sunburst",
    shape:
      "Text columns from the inner to the outer ring, and a value that sizes each leaf.",
    roles: [
      value(),
      {
        role: "change",
        label: "Colour by (diverging, red to green)",
        accepts: "numeric",
        fallback: "None",
        optional: true,
      },
    ],
    path: true,
    options: [],
  },
  {
    type: "sankey",
    label: "Sankey",
    shape: "One row per flow: from, to and how much.",
    roles: flowRoles,
    options: [],
  },
  {
    type: "graph",
    label: "Graph",
    shape:
      "One row per link: from, to and its weight. Nodes are sized by their total flow.",
    roles: flowRoles,
    options: [],
  },
  {
    type: "chord",
    label: "Chord",
    shape: "One row per flow: from, to and how much, drawn around a circle.",
    roles: flowRoles,
    options: [],
  },
  {
    type: "map",
    label: "World map",
    shape:
      "Either a country name and a value, coloured on a scale, or latitude and longitude points.",
    roles: [
      {
        role: "region",
        label: "Country",
        accepts: "categorical",
        fallback: "First text column",
      },
      value(),
      {
        role: "lat",
        label: "Latitude (points)",
        accepts: "numeric",
        fallback: "A column named lat",
        optional: true,
      },
      {
        role: "lon",
        label: "Longitude (points)",
        accepts: "numeric",
        fallback: "A column named lon",
        optional: true,
      },
      {
        role: "label",
        label: "Point name",
        accepts: "categorical",
        fallback: "First text column",
        optional: true,
      },
    ],
    options: [],
  },
  {
    type: "liquidityHeatmap",
    label: "Liquidity heatmap",
    shape:
      "Time and price buckets with a value per cell. A second statement of time and price draws a price line on top.",
    roles: [
      {
        role: "time",
        label: "Time",
        accepts: "temporal",
        fallback: "First timestamp column",
      },
      {
        role: "price",
        label: "Price",
        accepts: "numeric",
        fallback: "First numeric column",
      },
      value("Second numeric column"),
    ],
    options: [],
  },
  {
    type: "volumeProfile",
    label: "Volume profile",
    shape:
      "Volume per price level, split into buy and sell, or a single value. The level with the most volume is marked.",
    roles: [
      {
        role: "price",
        label: "Price",
        accepts: "numeric",
        fallback: "Column 1",
      },
      { role: "buy", label: "Buy", accepts: "numeric", fallback: "Column 2" },
      { role: "sell", label: "Sell", accepts: "numeric", fallback: "Column 3" },
      {
        role: "value",
        label: "Single value (instead of buy and sell)",
        accepts: "numeric",
        fallback: "None",
        optional: true,
      },
    ],
    options: [],
  },
  {
    type: "planTree",
    label: "Query plan",
    shape:
      "The first statement is EXPLAIN followed by a query; the plan is drawn as a tree of operators.",
    roles: [
      {
        role: "text",
        label: "Plan text",
        accepts: "any",
        fallback: "Column 1",
      },
    ],
    options: [],
  },
]

export const visualSpecOf = (type: VisualType): VisualSpec =>
  VISUAL_CATALOG.find((s) => s.type === type) ?? VISUAL_CATALOG[0]

/** Components drawn in HTML rather than as a chart: no picture of them. */
export const HTML_VISUAL_TYPES: ReadonlySet<string> = new Set([
  "stat",
  "bullet",
  "orderBook",
  "uptime",
  "planTree",
])
