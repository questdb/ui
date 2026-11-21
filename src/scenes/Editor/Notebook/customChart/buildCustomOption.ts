import { classifyColumn } from "../CellChart/inferChartConfig"
import {
  columnIndex,
  linksFrom,
  nodesOf,
  toLabel,
  toNumber,
  treeFromPath,
  type StatementRows,
} from "../visuals/statementRows"
import type { OptionProblem } from "./sanitizeOption"

// Turns a sanitized agent option into the option ECharts draws: the cell's
// statements become datasets "q0", "q1", …, `{"$rows": …}` placeholders
// become data in the shape a series needs, and the console sets the options
// it always owns.

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

const datasetsOf = (statements: (StatementRows | null)[]) =>
  statements.map((s, i) => {
    const columns = s?.columns ?? []
    const numeric = columns.flatMap((c, k) =>
      classifyColumn(c) === "numeric" ? [k] : [],
    )
    return {
      id: datasetId(i),
      dimensions: columns.map((c) => ({
        name: c.name,
        type: dimensionType(c.type),
      })),
      source:
        numeric.length === 0
          ? (s?.rows ?? [])
          : (s?.rows ?? []).map((row) => {
              const copy = row.slice()
              for (const k of numeric) copy[k] = chartNumber(row[k])
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

const resolveRows = (
  spec: RowsSpec,
  statements: (StatementRows | null)[],
  path: string,
  report: (path: string, message: string) => void,
): unknown => {
  const query = spec.query ?? 0
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
      return rows.rows.map((row) => idx.map((i) => cell(row, i)))
    }
    case "column": {
      const i = col(spec.column, "column", 0)
      return rows.rows.map((row) => cell(row, i))
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
      return rows.rows.map((row) => ({
        name: nameIdx < 0 ? "" : toLabel(row[nameIdx]),
        value:
          valueIdx.length === 1
            ? chartNumber(row[valueIdx[0]])
            : valueIdx.map((i) => chartNumber(row[i])),
      }))
    }
    case "tree": {
      const pathIdx = (spec.path ?? [rows.columns[0]?.name]).map((n) =>
        col(n, "path"),
      )
      const valueIdx = col(spec.value as string | undefined, "value", -1)
      const colorIdx = spec.color !== undefined ? col(spec.color, "color") : -1
      if (pathIdx.some((i) => i < 0) || valueIdx < 0) return []
      const tree = treeFromPath(rows, pathIdx, valueIdx, colorIdx)
      // `colorValue` becomes the second value so a visualMap can colour by it.
      const withColor = (nodes: typeof tree): unknown[] =>
        nodes.map((n) => ({
          name: n.name,
          value: n.colorValue !== undefined ? [n.value, n.colorValue] : n.value,
          ...(n.children ? { children: withColor(n.children) } : {}),
        }))
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
      return rows.rows.map((row) => ({
        ...(nameIdx >= 0 ? { name: toLabel(row[nameIdx]) } : {}),
        coords: [
          [toNumber(row[a]), toNumber(row[b])],
          [toNumber(row[c]), toNumber(row[d])],
        ],
        ...(valueIdx >= 0 ? { value: toNumber(row[valueIdx]) } : {}),
      }))
    }
    case "links":
    case "nodes": {
      const fromIdx = col(spec.source, "source", 0)
      const toIdx = col(spec.target, "target", 1)
      const valueIdx =
        spec.value !== undefined
          ? col(spec.value as string, "value")
          : columnIndex(rows, undefined, 2)
      if (fromIdx < 0 || toIdx < 0) return []
      const links = linksFrom(rows, fromIdx, toIdx, valueIdx)
      return spec.shape === "links" ? links : nodesOf(links)
    }
    default:
      report(
        `${path}.shape`,
        `Unknown shape ${JSON.stringify(spec.shape)}: use tuples, column, value, items, tree, links, nodes or lines.`,
      )
      return []
  }
}

const fillRows = (
  node: unknown,
  statements: (StatementRows | null)[],
  path: string,
  report: (path: string, message: string) => void,
): unknown => {
  if (Array.isArray(node))
    return node.map((n, i) => fillRows(n, statements, `${path}[${i}]`, report))
  if (!isRecord(node)) return node
  const keys = Object.keys(node)
  if (keys.length === 1 && keys[0] === ROWS_KEY && isRecord(node[ROWS_KEY])) {
    return resolveRows(node[ROWS_KEY] as RowsSpec, statements, path, report)
  }
  return Object.fromEntries(
    Object.entries(node).map(([k, v]) => [
      k,
      fillRows(v, statements, path ? `${path}.${k}` : k, report),
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

// Enforce console-owned rendering policies after row binding, including
// nested scopes such as timeline and media options that ECharts merges later.
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
  return Object.fromEntries(
    Object.entries(node)
      .filter(
        ([key]) => !(inTitle || inTreemapData) || !TITLE_NAVIGATION.has(key),
      )
      .map(([key, value]) => {
        const child = enforceRendererPolicy(
          value,
          key === "title" || inTitle,
          ((node.type === "treemap" || node.type === "sunburst") &&
            key === "data") ||
            inTreemapData,
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

const containsCyclicSankey = (node: unknown): boolean => {
  if (Array.isArray(node)) return node.some(containsCyclicSankey)
  if (!isRecord(node)) return false
  if (node.type === "sankey") {
    const links = node.links ?? node.edges
    if (Array.isArray(links)) {
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
      if (sources.length !== incoming.size) return true
    }
  }
  return [
    node.series,
    node.baseOption,
    node.options,
    node.media,
    node.option,
  ].some(containsCyclicSankey)
}

export type BuiltCustomOption = {
  option: Record<string, unknown>
  problems: OptionProblem[]
}

export const buildCustomOption = (
  sanitized: Record<string, unknown>,
  statements: (StatementRows | null)[],
  live: boolean,
): BuiltCustomOption => {
  const problems: OptionProblem[] = []
  const report = (path: string, message: string) => {
    if (problems.length < 50)
      problems.push({ path, message, severity: "warning" })
  }
  const filled = enforceRendererPolicy(
    fillRows(sanitized, statements, "", report),
  ) as Record<string, unknown>
  if (containsCyclicSankey(filled)) {
    return {
      option: {},
      problems: [
        {
          path: "",
          message:
            "Sankey links contain a cycle. Remove cycles or choose a graph visual.",
          severity: "error",
        },
      ],
    }
  }
  const ours = datasetsOf(statements)
  const theirs: unknown = filled.dataset
  const theirList: unknown[] = Array.isArray(theirs)
    ? (theirs as unknown[])
    : theirs
      ? [theirs]
      : []
  const reserved = new Set(ours.map((d) => d.id))
  for (const d of theirList) {
    if (isRecord(d) && typeof d.id === "string" && reserved.has(d.id))
      report(
        "dataset",
        `Dataset id ${JSON.stringify(d.id)} is reserved for the cell's statements; use another id.`,
      )
  }
  const datasets = [
    ...ours,
    ...theirList.filter(
      (d) => !(isRecord(d) && typeof d.id === "string" && reserved.has(d.id)),
    ),
  ]
  const datasetIds = datasets.map((d, i) =>
    isRecord(d) && typeof d.id === "string" ? d.id : String(i),
  )
  checkEncodes(filled, statements, datasetIds, report)

  const tooltip = isRecord(filled.tooltip)
    ? filled.tooltip
    : filled.tooltip === false
      ? { show: false }
      : {}
  const option: Record<string, unknown> = {
    useUTC: true,
    ...filled,
    dataset: datasets,
    tooltip: { ...tooltip, confine: true, renderMode: "richText" },
    ...(live ? { animation: false } : {}),
  }
  return { option, problems }
}
