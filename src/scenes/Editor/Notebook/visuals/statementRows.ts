import type { QueryExecResult } from "../../../../hooks/useQueryExecution"
import type { CellResult } from "../../../../store/notebook"
import {
  toExecResult,
  resultMatchesQueries,
} from "../DrawCanvas/drawCanvasUtils"
import { hasPendingResult } from "../statementIdentity"
import { classifyColumn } from "../CellChart/inferChartConfig"

// Statement results for visuals and custom charts: one entry per statement,
// in statement order, including statements that returned no rows (an empty
// order book side is still a side). Plus the small shaping helpers that turn
// rows into what a chart needs: tuples, name/value items, trees, links.

export type StatementRows = {
  columns: QueryExecResult["columns"]
  rows: QueryExecResult["dataset"]
  partial?: true
}

export type StatementResults =
  | { kind: "waiting" }
  | { kind: "settled"; statements: (StatementRows | null)[]; error?: string }

export const statementResultsOf = (
  result: CellResult | null | undefined,
  queries: string[],
): StatementResults => {
  if (!result || !resultMatchesQueries(result, queries))
    return { kind: "waiting" }
  if (hasPendingResult(result)) return { kind: "waiting" }
  let error: string | undefined
  const statements = result.results.map((r) => {
    const exec = toExecResult(r)
    if (exec.type === "error" && exec.error) error ??= exec.error
    return exec.type === "dql"
      ? {
          columns: exec.columns,
          rows: exec.dataset,
          ...(exec.count > exec.dataset.length
            ? { partial: true as const }
            : {}),
        }
      : null
  })
  return { kind: "settled", statements, error }
}

export type ShapeProblem = { path: string; message: string }

/**
 * The index of a column: by name when given, else the `fallback`-th column
 * (negative counts from the end), else -1.
 */
export const columnIndex = (
  rows: StatementRows,
  name: string | undefined,
  fallback?: number,
): number => {
  if (name !== undefined) return rows.columns.findIndex((c) => c.name === name)
  if (fallback === undefined) return -1
  const i = fallback < 0 ? rows.columns.length + fallback : fallback
  return i >= 0 && i < rows.columns.length ? i : -1
}

/** The first column of a role: temporal, numeric or categorical. */
export const firstColumnOf = (
  rows: StatementRows,
  role: "temporal" | "numeric" | "categorical",
  skip: number[] = [],
): number =>
  rows.columns.findIndex(
    (c, i) => !skip.includes(i) && classifyColumn(c) === role,
  )

export const toNumber = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }
  if (typeof value === "boolean") return value ? 1 : 0
  return null
}

export const toLabel = (value: unknown): string => {
  if (value === null || value === undefined) return ""
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean")
    return String(value)
  return JSON.stringify(value) ?? ""
}

/** Epoch milliseconds of a QuestDB timestamp (ISO text or a number). */
export const toTime = (value: unknown): number | null => {
  if (typeof value === "number") return value
  if (typeof value !== "string") return null
  const ms = Date.parse(value.replace(/(\.\d{3})\d+/, "$1"))
  return Number.isFinite(ms) ? ms : null
}

export type TreeNode = {
  name: string
  value?: number
  children?: TreeNode[]
  // The row's value of a colour column, when given.
  colorValue?: number
  columns?: Record<string, StatementRows["rows"][number][number]>
}

/**
 * A tree from rows that name their path level by level, e.g. sector then
 * symbol. Leaves carry the value; parents carry the sum of their children.
 */
export const treeFromPath = (
  rows: StatementRows,
  pathIdx: number[],
  valueIdx: number,
  colorIdx = -1,
  clickIdx = -1,
): TreeNode[] => {
  const root: TreeNode = { name: "", children: [] }
  const column = rows.columns[clickIdx]?.name
  const ambiguous = new WeakSet<TreeNode>()
  const childrenByName = new WeakMap<TreeNode, Map<string, TreeNode>>()
  for (const row of rows.rows) {
    let node = root
    pathIdx.forEach((p, level) => {
      const name = toLabel(row[p])
      let children = childrenByName.get(node)
      if (!children) {
        children = new Map()
        childrenByName.set(node, children)
      }
      let child = children.get(name)
      if (!child) {
        child = { name }
        children.set(name, child)
        ;(node.children ??= []).push(child)
      }
      if (level === pathIdx.length - 1) {
        child.value = (child.value ?? 0) + (toNumber(row[valueIdx]) ?? 0)
        if (column !== undefined && !ambiguous.has(child)) {
          const selection = row[clickIdx]
          if (!child.columns) child.columns = { [column]: selection }
          else if (child.columns[column] !== selection) {
            // This leaf aggregates different source rows. Never pick an
            // arbitrary row for an explicitly bound selection.
            delete child.columns
            ambiguous.add(child)
          }
        }
        if (colorIdx >= 0) {
          const c = toNumber(row[colorIdx])
          if (c !== null) child.colorValue = c
        }
      }
      node = child
    })
  }
  const sum = (node: TreeNode): number => {
    if (!node.children || node.children.length === 0) return node.value ?? 0
    node.value = node.children.reduce((total, c) => total + sum(c), 0)
    return node.value
  }
  sum(root)
  return root.children ?? []
}

export type Link = { source: string; target: string; value: number }

export const linksFrom = (
  rows: StatementRows,
  fromIdx: number,
  toIdx: number,
  valueIdx: number,
): Link[] =>
  rows.rows.map((row) => ({
    source: toLabel(row[fromIdx]),
    target: toLabel(row[toIdx]),
    value: valueIdx >= 0 ? (toNumber(row[valueIdx]) ?? 0) : 1,
  }))

export const nodesOf = (links: Link[]): { name: string }[] => {
  const names = new Set<string>()
  for (const link of links) {
    names.add(link.source)
    names.add(link.target)
  }
  return [...names].map((name) => ({ name }))
}
