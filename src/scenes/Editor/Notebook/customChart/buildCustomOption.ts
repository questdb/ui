import { classifyColumn } from "../CellChart/inferChartConfig"
import {
  columnIndex,
  linksFrom,
  nodesFrom,
  toLabel,
  toNumber,
  treeFromPath,
  type StatementRows,
} from "../visuals/statementRows"
import {
  PICK_KEY,
  ROW_DIMENSION,
  STATEMENT_DIMENSION,
  pickOf,
} from "../interactions/selection"
import { isSafeImage, type OptionProblem } from "./sanitizeOption"
import {
  MAX_SANKEY_LINKS,
  SANKEY_LINK_LIMIT_MESSAGE,
} from "../visuals/sankeyLayoutLimit"

// Turns a sanitized agent option into the option ECharts draws: the cell's
// statements become datasets "q0", "q1", …, `{"$rows": …}` placeholders
// become data in the shape a series needs, and the console sets the options
// it always owns.
//
// When clicks set a variable, every bound item carries the statement rows it
// is drawn from (a `pick`, see selection.ts), and every dataset row carries
// its statement and row in two hidden dimensions, which survive dataset
// transforms.

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const dimensionType = (type: string): "time" | "float" | "ordinal" => {
  const role = classifyColumn({ name: "", type })
  if (role === "temporal") return "time"
  if (role === "numeric") return "float"
  return "ordinal"
}

export const datasetId = (index: number) => `q${index}`

// Plot coordinates must not be rounded for display before reaching ECharts.
export const chartNumber = (value: unknown): number | null => toNumber(value)

const HIDDEN_DIMENSIONS = [
  { name: STATEMENT_DIMENSION, type: "int" },
  { name: ROW_DIMENSION, type: "int" },
]

const datasetsOf = (statements: (StatementRows | null)[], hidden: boolean) =>
  statements.map((s, i) => {
    const columns = s?.columns ?? []
    const numeric = columns.flatMap((c, k) =>
      classifyColumn(c) === "numeric" ? [k] : [],
    )
    return {
      id: datasetId(i),
      dimensions: [
        ...columns.map((c) => ({
          name: c.name,
          type: dimensionType(c.type),
        })),
        ...(hidden ? HIDDEN_DIMENSIONS : []),
      ],
      // QuestDB provides schema separately; the first array is always data.
      sourceHeader: false,
      source:
        numeric.length === 0 && !hidden
          ? (s?.rows ?? [])
          : (s?.rows ?? []).map((row, r) => {
              const copy: unknown[] = row.slice()
              for (const k of numeric) {
                const raw = row[k]
                const number = chartNumber(raw)
                // ECharts parses float dimensions for plotting. Retain the
                // exact text in raw event data for clicks and tooltips.
                copy[k] =
                  typeof raw === "string" && number !== null ? raw : number
              }
              if (hidden) copy.push(i, r)
              return copy
            }),
    }
  })

const ROWS_KEY = "$rows"

type RowsSpec = {
  query?: number
  shape?: string
  columns?: string[]
  column?: string
  name?: string
  value?: string | string[]
  path?: string[]
  source?: string
  target?: string
  color?: string
}

type Report = (
  path: string,
  message: string,
  severity?: OptionProblem["severity"],
) => void

// Where bound rows go (and the type of the series they go in), and whether
// their items carry picks.
type Binding = { path: string; pickable: boolean; seriesType?: string }

const SERIES_PATH = /^series(\[\d+\])?$/

// Series whose data may be `{ value }` items instead of plain values (a
// theme river reads its tuples as they are).
const VALUE_ITEM_SERIES = new Set([
  "line",
  "bar",
  "pie",
  "scatter",
  "effectScatter",
  "candlestick",
  "boxplot",
  "heatmap",
  "funnel",
  "pictorialBar",
  "custom",
])

// Plain values (tuples, a column) become items only as such a series' data.
const isValueItems = ({ path, seriesType }: Binding) =>
  /^series(\[\d+\])?\.data$/.test(path) &&
  seriesType !== undefined &&
  VALUE_ITEM_SERIES.has(seriesType)

// A placeholder that does not bind (a wrong field type in an agent's or an
// imported option) reports a problem and binds nothing: it must not take the
// console down with it.
const resolveRows = (
  spec: RowsSpec,
  statements: (StatementRows | null)[],
  binding: Binding,
  report: Report,
): unknown => {
  const { path } = binding
  for (const key of ["columns", "path"] as const)
    if (spec[key] !== undefined && !Array.isArray(spec[key])) {
      report(
        `${path}.${key}`,
        `${key} must be a list of column names.`,
        "error",
      )
      return []
    }
  try {
    return bindRows(spec, statements, binding, report)
  } catch (error) {
    report(
      path,
      `The rows could not be bound: ${error instanceof Error ? error.message : String(error)}`,
      "error",
    )
    return []
  }
}

const bindRows = (
  spec: RowsSpec,
  statements: (StatementRows | null)[],
  binding: Binding,
  report: Report,
): unknown => {
  const { path, pickable } = binding
  const query = spec.query ?? 0
  // An item drawn from rows of the statement, by `column` when it has one.
  const picked = <T extends object>(
    item: T,
    rows: number[],
    column?: number,
  ) => (pickable ? { ...item, [PICK_KEY]: pickOf(query, rows, column) } : item)
  // A plain value becomes an item, drawn from its row, as a series' data.
  const pickedValue = (value: unknown, row: number, column?: number) =>
    pickable && isValueItems(binding)
      ? { value, [PICK_KEY]: pickOf(query, [row], column) }
      : value
  const rows = statements[query]
  if (!rows) {
    report(path, `Statement ${query} has no rows (or does not exist).`)
    return []
  }
  const col = (name: string | undefined, role: string, fallback?: number) => {
    const i = columnIndex(rows, name, fallback)
    if (i < 0)
      report(
        path,
        `Column ${JSON.stringify(name ?? role)} is not in statement ${query} (columns: ${rows.columns.map((c) => c.name).join(", ")}).`,
      )
    return i
  }
  // LONG values arrive as strings (to keep their precision); a chart wants
  // numbers.
  const cell = (row: unknown[], i: number) =>
    i < 0
      ? null
      : classifyColumn(rows.columns[i]) === "numeric"
        ? chartNumber(row[i])
        : row[i]
  switch (spec.shape ?? "tuples") {
    case "tuples": {
      const idx = (spec.columns ?? rows.columns.map((c) => c.name)).map((n) =>
        col(n, "column"),
      )
      // A tuple is drawn from its row's first column, its x.
      return rows.rows.map((row, r) =>
        pickedValue(
          idx.map((i) => cell(row, i)),
          r,
          idx[0],
        ),
      )
    }
    case "column": {
      // A column's value names nothing: it is drawn from no column.
      const i = col(spec.column, "column", 0)
      return rows.rows.map((row, r) => pickedValue(cell(row, i), r))
    }
    case "value": {
      const i = col(spec.column, "column", 0)
      return i < 0 || rows.rows.length === 0
        ? null
        : chartNumber(rows.rows[0][i])
    }
    case "items": {
      const nameIdx = col(spec.name, "name", 0)
      const values = Array.isArray(spec.value) ? spec.value : [spec.value]
      const valueIdx = values.map((v, k) => col(v, "value", k + 1))
      // An item is drawn from its row's name.
      return rows.rows.map((row, r) =>
        picked(
          {
            name: nameIdx < 0 ? "" : toLabel(row[nameIdx]),
            value:
              valueIdx.length === 1
                ? chartNumber(row[valueIdx[0]])
                : valueIdx.map((i) => chartNumber(row[i])),
          },
          [r],
          nameIdx,
        ),
      )
    }
    case "tree": {
      if (rows.partial) {
        report(
          "",
          `Statement ${query} returned only part of its rows. Aggregate by path in SQL or reduce the result before drawing this hierarchy.`,
          "error",
        )
        return []
      }
      const pathIdx = (spec.path ?? [rows.columns[0]?.name]).map((n) =>
        col(n, "path"),
      )
      const valueIdx = col(spec.value as string | undefined, "value", -1)
      const colorIdx = spec.color !== undefined ? col(spec.color, "color") : -1
      if (pathIdx.some((i) => i < 0) || valueIdx < 0) return []
      const tree = treeFromPath(rows, pathIdx, valueIdx, colorIdx)
      // `colorValue` becomes the second value so a visualMap can colour by
      // it. A node is drawn from the rows under it, by its level's column.
      const withColor = (nodes: typeof tree): unknown[] =>
        nodes.map((n) =>
          picked(
            {
              name: n.name,
              value:
                n.colorValue !== undefined ? [n.value, n.colorValue] : n.value,
              ...(n.children ? { children: withColor(n.children) } : {}),
            },
            n.rows,
            n.column,
          ),
        )
      return withColor(tree)
    }
    case "lines": {
      // Routes for a `lines` series: columns = from lon, from lat, to lon,
      // to lat.
      const idx = (spec.columns ?? []).map((n) => col(n, "column"))
      if (idx.length !== 4 || idx.some((i) => i < 0)) {
        report(
          path,
          "shape lines needs columns: [from lon, from lat, to lon, to lat].",
        )
        return []
      }
      const nameIdx = spec.name !== undefined ? col(spec.name, "name") : -1
      const valueIdx =
        typeof spec.value === "string" ? col(spec.value, "value") : -1
      const [a, b, c, d] = idx
      // A route is drawn from its row, named by its name column.
      return rows.rows.map((row, r) =>
        picked(
          {
            ...(nameIdx >= 0 ? { name: toLabel(row[nameIdx]) } : {}),
            coords: [
              [toNumber(row[a]), toNumber(row[b])],
              [toNumber(row[c]), toNumber(row[d])],
            ],
            ...(valueIdx >= 0 ? { value: toNumber(row[valueIdx]) } : {}),
          },
          [r],
          nameIdx,
        ),
      )
    }
    case "links":
    case "nodes": {
      if (rows.partial) {
        report(
          "",
          `Statement ${query} returned only part of its rows. Aggregate links in SQL or reduce the result before drawing this graph.`,
          "error",
        )
        return []
      }
      const fromIdx = col(spec.source, "source", 0)
      const toIdx = col(spec.target, "target", 1)
      const valueIdx =
        spec.value !== undefined
          ? col(spec.value as string, "value")
          : columnIndex(rows, undefined, 2)
      if (fromIdx < 0 || toIdx < 0) return []
      // A link is drawn from its row but no column; a node from the rows it
      // is the source (else the target) of, by that column.
      return spec.shape === "links"
        ? linksFrom(rows, fromIdx, toIdx, valueIdx).map((link, r) =>
            picked(link, [r]),
          )
        : nodesFrom(rows, query, fromIdx, toIdx).map(({ name, pick }) =>
            picked({ name }, pick.rows, pick.column),
          )
    }
    default:
      report(
        `${path}.shape`,
        `Unknown shape ${JSON.stringify(spec.shape)}: use tuples, column, value, items, tree, links, nodes or lines.`,
      )
      return []
  }
}

// Values bound from rows arrive after the option was made safe, so they get
// its image rule again: an `image://` symbol other than a data: image would
// make the browser fetch any URL, which a query can fill with its results.
const withSafeImages = (
  value: unknown,
  path: string,
  report: Report,
): unknown => {
  if (typeof value === "string") {
    if (!value.startsWith("image://") || isSafeImage(value.slice(8)))
      return value
    report(path, "Only data: images are allowed; the symbol is a circle.")
    return "circle"
  }
  if (Array.isArray(value))
    return value.map((child, i) =>
      withSafeImages(child, `${path}[${i}]`, report),
    )
  if (!isRecord(value)) return value
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      withSafeImages(child, `${path}.${key}`, report),
    ]),
  )
}

const fillRows = (
  node: unknown,
  statements: (StatementRows | null)[],
  binding: Binding,
  report: Report,
): unknown => {
  const { path } = binding
  if (Array.isArray(node))
    return node.map((n, i) =>
      fillRows(n, statements, { ...binding, path: `${path}[${i}]` }, report),
    )
  if (!isRecord(node)) return node
  const keys = Object.keys(node)
  if (keys.length === 1 && keys[0] === ROWS_KEY && isRecord(node[ROWS_KEY])) {
    return withSafeImages(
      resolveRows(node[ROWS_KEY] as RowsSpec, statements, binding, report),
      path,
      report,
    )
  }
  const seriesType =
    SERIES_PATH.test(path) && typeof node.type === "string"
      ? node.type
      : binding.seriesType
  return Object.fromEntries(
    Object.entries(node)
      // Only bound rows say what a click selects.
      .filter(([k]) => k !== PICK_KEY)
      .map(([k, v]) => [
        k,
        fillRows(
          v,
          statements,
          { ...binding, path: path ? `${path}.${k}` : k, seriesType },
          report,
        ),
      ]),
  )
}

const checkEncodes = (
  option: Record<string, unknown>,
  statements: (StatementRows | null)[],
  datasetIds: string[],
  report: (path: string, message: string) => void,
) => {
  const series = Array.isArray(option.series) ? option.series : []
  series.forEach((s, i) => {
    if (!isRecord(s) || !isRecord(s.encode)) return
    const ref =
      typeof s.datasetId === "string"
        ? datasetIds.indexOf(s.datasetId)
        : typeof s.datasetIndex === "number"
          ? s.datasetIndex
          : 0
    const rows = statements[ref]
    if (!rows) return
    const names = new Set(rows.columns.map((c) => c.name))
    for (const [dim, value] of Object.entries(s.encode)) {
      for (const column of Array.isArray(value) ? value : [value]) {
        if (typeof column === "string" && !names.has(column))
          report(
            `series[${i}].encode.${dim}`,
            `Column ${JSON.stringify(column)} is not in dataset ${datasetIds[ref] ?? ref} (columns: ${[...names].join(", ")}).`,
          )
      }
    }
  })
}

// Enforce console-owned rendering policies after row binding.
const TITLE_NAVIGATION = new Set(["link", "sublink", "target", "subtarget"])

const enforceRendererPolicy = (
  node: unknown,
  inTitle = false,
  inTreemapData = false,
): unknown => {
  if (Array.isArray(node))
    return node.map((child) =>
      enforceRendererPolicy(child, inTitle, inTreemapData),
    )
  if (!isRecord(node)) return node
  // Tree series inherit `link` from the series and its levels into every
  // node, so navigation is removed at all three scopes.
  const treeSeries = node.type === "treemap" || node.type === "sunburst"
  return Object.fromEntries(
    Object.entries(node)
      .filter(
        ([key]) =>
          !(inTitle || inTreemapData || treeSeries) ||
          !TITLE_NAVIGATION.has(key),
      )
      .map(([key, value]) => {
        const child = enforceRendererPolicy(
          value,
          key === "title" || inTitle,
          (treeSeries && (key === "data" || key === "levels")) || inTreemapData,
        )
        if (key !== "tooltip") return [key, child]
        const normalize = (tooltip: unknown) => {
          if (tooltip === false) return false
          if (typeof tooltip === "string")
            return { formatter: tooltip, renderMode: "richText" }
          return isRecord(tooltip)
            ? { ...tooltip, renderMode: "richText" }
            : undefined
        }
        return [
          key,
          Array.isArray(child)
            ? child.map(normalize).filter(Boolean)
            : normalize(child),
        ]
      }),
  )
}

const sankeyProblem = (node: unknown): string | undefined => {
  if (Array.isArray(node)) {
    for (const child of node) {
      const problem = sankeyProblem(child)
      if (problem) return problem
    }
    return
  }
  if (!isRecord(node)) return
  if (node.type === "sankey") {
    const links = node.links ?? node.edges
    if (Array.isArray(links)) {
      if (links.length > MAX_SANKEY_LINKS) return SANKEY_LINK_LIMIT_MESSAGE
      const outgoing = new Map<string, string[]>()
      const incoming = new Map<string, number>()
      for (const link of links) {
        if (!isRecord(link)) continue
        const { source, target } = link
        if (
          (typeof source !== "string" && typeof source !== "number") ||
          (typeof target !== "string" && typeof target !== "number")
        )
          continue
        const from = String(source)
        const to = String(target)
        const children = outgoing.get(from) ?? []
        children.push(to)
        outgoing.set(from, children)
        if (!incoming.has(from)) incoming.set(from, 0)
        incoming.set(to, (incoming.get(to) ?? 0) + 1)
      }
      const sources = [...incoming]
        .filter(([, count]) => count === 0)
        .map(([name]) => name)
      for (const from of sources) {
        for (const to of outgoing.get(from) ?? []) {
          const remaining = (incoming.get(to) ?? 0) - 1
          incoming.set(to, remaining)
          if (remaining === 0) sources.push(to)
        }
      }
      if (sources.length !== incoming.size)
        return "Sankey links contain a cycle. Remove cycles or choose a graph visual."
    }
  }
  return sankeyProblem(node.series)
}

export const customSeriesCount = (option: Record<string, unknown>): number => {
  const series = option.series
  return Array.isArray(series) ? series.length : isRecord(series) ? 1 : 0
}

export type BuiltCustomOption = {
  option: Record<string, unknown>
  problems: OptionProblem[]
}

export const partialDatasetWarnings = (
  statements: (StatementRows | null)[],
): OptionProblem[] =>
  statements.flatMap((rows, index) =>
    rows?.partial
      ? [
          {
            path: `dataset.q${index}`,
            severity: "warning" as const,
            message: `Statement ${index + 1} returned only part of its rows. Chart transformations use the returned rows only.`,
          },
        ]
      : [],
  )

const asList = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : value === undefined ? [] : [value]

// Series types that draw a dataset's rows when they have no data of their
// own.
const DATASET_SERIES = new Set([
  "line",
  "bar",
  "pie",
  "scatter",
  "effectScatter",
  "candlestick",
  "boxplot",
  "heatmap",
  "funnel",
  "parallel",
  "pictorialBar",
  "custom",
])

// Series types whose coordinates are only a cartesian x and y.
const XY_SERIES = new Set([
  "line",
  "bar",
  "scatter",
  "effectScatter",
  "pictorialBar",
  "custom",
])

// Encode keys that map no coordinate.
const NON_COORD_ENCODES = new Set([
  "tooltip",
  "label",
  "itemName",
  "itemId",
  "itemGroupId",
  "itemChildGroupId",
  "seriesName",
])

/**
 * The statement whose rows a dataset-bound series draws: its dataset is the
 * statement's, or derives from it through transforms.
 */
const seriesStatement = (
  series: unknown,
  datasets: unknown[],
  datasetIds: string[],
  statementCount: number,
): number | undefined => {
  if (!isRecord(series) || series.data !== undefined) return undefined
  if (typeof series.type !== "string" || !DATASET_SERIES.has(series.type))
    return undefined
  let index =
    typeof series.datasetId === "string"
      ? datasetIds.indexOf(series.datasetId)
      : typeof series.datasetIndex === "number"
        ? series.datasetIndex
        : 0
  const seen = new Set<number>()
  while (index >= 0 && index < datasets.length && !seen.has(index)) {
    if (index < statementCount) return index
    seen.add(index)
    const dataset = datasets[index]
    if (!isRecord(dataset) || dataset.source !== undefined) return undefined
    index =
      typeof dataset.fromDatasetId === "string"
        ? datasetIds.indexOf(dataset.fromDatasetId)
        : typeof dataset.fromDatasetIndex === "number"
          ? dataset.fromDatasetIndex
          : dataset.transform !== undefined
            ? 0
            : -1
  }
  return undefined
}

/**
 * The option's series and visual maps with the hidden dimensions appended to
 * the statements' datasets, drawn as they are without them; null when they
 * cannot be (a series laid out by row, a visual map over series with
 * different dimensions), and the datasets stay as they are.
 */
const withHiddenDimensions = (
  option: Record<string, unknown>,
  statements: (StatementRows | null)[],
  datasets: unknown[],
  datasetIds: string[],
): Record<string, unknown> | null => {
  const series = asList(option.series)
  const statementOf = (s: unknown) =>
    seriesStatement(s, datasets, datasetIds, statements.length)
  // A series laid out by row would take the hidden values as categories.
  if (
    series.some(
      (s) =>
        isRecord(s) &&
        s.seriesLayoutBy === "row" &&
        statementOf(s) !== undefined,
    )
  )
    return null
  // A visual map without a dimension maps a series' last one: keep it on the
  // last column, not on the hidden row number.
  const visualMaps: unknown[] = []
  for (const visualMap of asList(option.visualMap)) {
    if (!isRecord(visualMap) || visualMap.dimension !== undefined) {
      visualMaps.push(visualMap)
      continue
    }
    const targets =
      visualMap.seriesIndex === undefined
        ? series.map((_, i) => i)
        : asList(visualMap.seriesIndex).filter(
            (i): i is number => typeof i === "number",
          )
    const last = new Set<number>()
    let unbound = false
    for (const target of targets) {
      if (target >= series.length) continue
      const statement = statementOf(series[target])
      if (statement === undefined) unbound = true
      else last.add((statements[statement]?.columns.length ?? 0) - 1)
    }
    if (last.size > 1 || (last.size === 1 && unbound)) return null
    visualMaps.push(
      last.size === 1 ? { ...visualMap, dimension: [...last][0] } : visualMap,
    )
  }
  // A cartesian series whose x and y are both times or categories shows
  // every dimension in its tooltip: keep that to the statement's columns.
  const fitted = series.map((s) => {
    const statement = statementOf(s)
    if (statement === undefined || !isRecord(s) || !isRecord(s.encode)) return s
    const encode = s.encode
    if (
      typeof s.type !== "string" ||
      !XY_SERIES.has(s.type) ||
      (s.coordinateSystem !== undefined &&
        s.coordinateSystem !== "cartesian2d") ||
      encode.tooltip !== undefined ||
      !("x" in encode && "y" in encode)
    )
      return s
    const columns = statements[statement]?.columns ?? []
    const coords = Object.entries(encode)
      .filter(([key]) => !NON_COORD_ENCODES.has(key))
      .flatMap(([, value]) => asList(value))
      .map((dim) =>
        typeof dim === "number"
          ? columns[dim]
          : columns.find((c) => c.name === dim),
      )
    if (coords.some((c) => !c || classifyColumn(c) === "numeric")) return s
    return { ...s, encode: { ...encode, tooltip: columns.map((c) => c.name) } }
  })
  return {
    ...(option.series === undefined
      ? {}
      : { series: Array.isArray(option.series) ? fitted : fitted[0] }),
    ...(option.visualMap === undefined
      ? {}
      : {
          visualMap: Array.isArray(option.visualMap)
            ? visualMaps
            : visualMaps[0],
        }),
  }
}

/**
 * Where a dataset-bound series' marks come from: the statement its rows are
 * of, and the column it draws them from, by name: its `encode.itemName`,
 * else its dimension on a category axis. An unbound click on its marks
 * selects that column.
 */
export const datasetSource = (
  option: Record<string, unknown>,
  statements: (StatementRows | null)[],
  seriesIndex: number,
): { datasetStatement: number; drawnColumn?: string } | undefined => {
  const series = asList(option.series)[seriesIndex]
  const datasets = asList(option.dataset)
  const datasetIds = datasets.map((d, i) =>
    isRecord(d) && typeof d.id === "string" ? d.id : String(i),
  )
  const statement = seriesStatement(
    series,
    datasets,
    datasetIds,
    statements.length,
  )
  if (statement === undefined || !isRecord(series)) return undefined
  const source = (drawnColumn: string | undefined) => ({
    datasetStatement: statement,
    ...(drawnColumn === undefined ? {} : { drawnColumn }),
  })
  const columns = statements[statement]?.columns ?? []
  const encode = isRecord(series.encode) ? series.encode : {}
  const nameOf = (value: unknown) => {
    const dim = asList(value)[0]
    if (typeof dim === "number") return columns[dim]?.name
    return columns.some((c) => c.name === dim) ? (dim as string) : undefined
  }
  if (encode.itemName !== undefined) return source(nameOf(encode.itemName))
  const axisType = (key: "xAxis" | "yAxis", index: unknown) => {
    const axis = asList(option[key])[typeof index === "number" ? index : 0]
    const type = isRecord(axis) ? axis.type : undefined
    // ECharts' own defaults: x a category axis, y a value axis.
    return type ?? (key === "xAxis" ? "category" : "value")
  }
  if (
    encode.x !== undefined &&
    axisType("xAxis", series.xAxisIndex) === "category"
  )
    return source(nameOf(encode.x))
  if (
    encode.y !== undefined &&
    axisType("yAxis", series.yAxisIndex) === "category"
  )
    return source(nameOf(encode.y))
  return source(undefined)
}

export const buildCustomOption = (
  sanitized: Record<string, unknown>,
  statements: (StatementRows | null)[],
  live: boolean,
  // Clicks set a variable: bound items and dataset rows say what they are
  // drawn from.
  pickable = false,
): BuiltCustomOption => {
  const problems = partialDatasetWarnings(statements)
  let fatal: OptionProblem | undefined
  const report: Report = (path, message, severity = "warning") => {
    if (severity === "error" && path === "")
      fatal ??= { path, message, severity }
    else if (problems.length < 50) problems.push({ path, message, severity })
  }
  const bound = fillRows(sanitized, statements, { path: "", pickable }, report)
  if (fatal) return { option: {}, problems: [fatal] }
  const filled = enforceRendererPolicy(bound) as Record<string, unknown>
  const invalidSankey = sankeyProblem(filled)
  if (invalidSankey) {
    return {
      option: {},
      problems: [
        {
          path: "",
          message: invalidSankey,
          severity: "error",
        },
      ],
    }
  }
  const base = filled
  const theirs: unknown = base.dataset
  const theirList: unknown[] = Array.isArray(theirs)
    ? (theirs as unknown[])
    : theirs
      ? [theirs]
      : []
  const reserved = new Set(statements.map((_, i) => datasetId(i)))
  for (const d of theirList) {
    if (isRecord(d) && typeof d.id === "string" && reserved.has(d.id))
      report(
        "dataset",
        `Dataset id ${JSON.stringify(d.id)} is reserved for the cell's statements; use another id.`,
      )
  }
  const kept = theirList.filter(
    (d) => !(isRecord(d) && typeof d.id === "string" && reserved.has(d.id)),
  )
  const datasetIds = [...reserved, ...kept].map((d, i) =>
    typeof d === "string"
      ? d
      : isRecord(d) && typeof d.id === "string"
        ? d.id
        : String(i),
  )
  checkEncodes(base, statements, datasetIds, report)
  const hidden = pickable
    ? withHiddenDimensions(
        base,
        statements,
        [...statements.map(() => null), ...kept],
        datasetIds,
      )
    : null
  const datasets = [...datasetsOf(statements, hidden !== null), ...kept]

  const tooltip = isRecord(base.tooltip)
    ? base.tooltip
    : base.tooltip === false
      ? { show: false }
      : {}
  const option = {
    useUTC: true,
    ...base,
    ...hidden,
    dataset: datasets,
    tooltip: { ...tooltip, confine: true, renderMode: "richText" },
    ...(live ? { animation: false } : {}),
  }
  return { option, problems }
}
