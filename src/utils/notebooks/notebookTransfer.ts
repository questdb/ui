import type { ChartConfig } from "../../scenes/Editor/Notebook/CellChart/chartTypes"
import { getQueriesFromPositionInText } from "../../scenes/Editor/Monaco/utils"
import {
  computeAgentCellGridH,
  computeCellHeights,
  computeResultBottomHeight,
  DEFAULT_CHART_BOTTOM_HEIGHT,
  topHeightForSql,
} from "../../scenes/Editor/Notebook/cellSizing"
import {
  createCell,
  exceedsCellLineLimit,
  MAX_NOTEBOOK_CELLS,
  type DqlQueryResult,
  type NotebookCell,
  type NotebookViewState,
} from "../../store/notebook"
import type { QueryRawResult } from "../questdb"
import { Type } from "../questdb"

export type NotebookTransferSource =
  | "result_chart"
  | "result_grid"
  | "result_monitor"
  | "script_results"
  | "editor_split"
  | "editor_single"

export type TransferQuery = {
  sql: string
  result?: DqlQueryResult
  chartConfig?: ChartConfig
}

export type EditorBatchTransfer = {
  bufferId: number
  queries: TransferQuery[]
  writeCount: number
  hasAllResults: boolean
}

// Keep only the last batch, with bounded rows, not a growing query history.
export const BATCH_TRANSFER_BYTES = 10_000_000
export const TRANSFER_RESULT_BYTES = 2_000_000

export const toTransferResult = (
  result: Extract<QueryRawResult, { type: Type.DQL }>,
  fetchedAt: number,
): DqlQueryResult => ({
  type: "dql",
  query: result.query,
  columns: result.columns,
  dataset: result.dataset,
  count: result.count,
  timestamp: result.timestamp,
  timings: result.timings,
  fetchedAt,
  notice: "Loaded rows from editor",
  // The editor fetches only its first page. A partial frame must not be
  // drawn as if complete: draw mode refetches truncated frames.
  ...(result.count > result.dataset.length ? { truncated: true } : {}),
})

export const buildBatchTransfer = (
  bufferId: number,
  results: Array<{
    success: boolean
    result?: QueryRawResult
    fetchedAt?: number
  }>,
  expectedCount: number,
): EditorBatchTransfer | undefined => {
  if (results.length !== expectedCount || results.some((r) => !r.success))
    return undefined
  const reads: Array<{
    result: Extract<QueryRawResult, { type: Type.DQL }>
    fetchedAt?: number
  }> = []
  let writeCount = 0
  for (const item of results) {
    if (item.result?.type === Type.DDL || item.result?.type === Type.DML)
      writeCount++
    else if (item.result?.type === Type.DQL)
      reads.push({ result: item.result, fetchedAt: item.fetchedAt })
  }
  if (reads.length < 2 || reads.length > MAX_NOTEBOOK_CELLS) return undefined
  // Size results only while all of them can still be kept. The fallback is an
  // unexecuted script, not a mixture of populated and empty cells that would
  // imply a complete side-by-side comparison, so the first result over budget
  // ends the measuring: this runs on the main thread when a script finishes.
  let bytes = 0
  const withResults: TransferQuery[] = []
  for (const { result: raw, fetchedAt } of reads) {
    const result = toTransferResult(raw, fetchedAt ?? Date.now())
    const size = new TextEncoder().encode(JSON.stringify(result)).byteLength
    if (size > TRANSFER_RESULT_BYTES || bytes + size > BATCH_TRANSFER_BYTES)
      break
    bytes += size
    withResults.push({ sql: result.query, result })
  }
  const hasAllResults = withResults.length === reads.length
  return {
    bufferId,
    queries: hasAllResults
      ? withResults
      : reads.map(({ result }) => ({ sql: result.query })),
    writeCount,
    hasAllResults,
  }
}

// Use the editor's SQL-aware offsets, but retain the source between statements
// (comments and delimiters). Only trim whitespace around each new cell;
// whitespace inside SQL, literals and explanations must remain untouched.
export const splitEditorScript = (sql: string): string[] => {
  const lines = sql.split("\n")
  const { sqlTextStack, nextSql } = getQueriesFromPositionInText(sql, {
    lineNumber: lines.length,
    column: lines[lines.length - 1].length + 1,
  })
  const statements = nextSql ? [...sqlTextStack, nextSql] : sqlTextStack
  let start = 0
  return statements
    .map((statement, index) => {
      const end =
        index === statements.length - 1
          ? sql.length
          : statement.limit + (sql[statement.limit] === ";" ? 1 : 0)
      const value = sql.slice(start, end)
      start = end
      return value.trim()
    })
    .filter((value) => value.length > 0)
}

export const createTransferCells = (
  queries: TransferQuery[],
): NotebookCell[] => {
  if (queries.length === 0 || queries.length > MAX_NOTEBOOK_CELLS)
    throw new Error(`A notebook supports up to ${MAX_NOTEBOOK_CELLS} cells.`)
  return queries.map(({ sql, result, chartConfig }, position) => {
    if (exceedsCellLineLimit(sql))
      throw new Error("A query is too large for a notebook cell.")
    const cell: NotebookCell = {
      ...createCell(position, sql),
      name: queries.length > 1 ? `Query ${position + 1}` : undefined,
      autoRefresh: false,
      topHeight: Math.min(240, topHeightForSql(sql)),
      topResized: true,
      ...(result
        ? {
            result: {
              results: [result],
              activeResultIndex: 0,
              timestamp: result.fetchedAt ?? Date.now(),
            },
            lastRunStatus: "success" as const,
          }
        : {}),
      ...(chartConfig
        ? {
            mode: "draw" as const,
            chartConfig,
            deferInitialDraw: true,
            bottomHeight: DEFAULT_CHART_BOTTOM_HEIGHT,
          }
        : {}),
    }
    if (result && !chartConfig)
      cell.bottomHeight = computeResultBottomHeight(cell.result, sql)
    return cell
  })
}

export const createTransferView = (
  cells: NotebookCell[],
  compare = false,
): NotebookViewState => {
  if (!compare) return { cells, focusedCellId: cells[0]?.id }
  const aligned = cells.map((cell, index) => {
    const pair = cells.slice(
      Math.floor(index / 2) * 2,
      Math.floor(index / 2) * 2 + 2,
    )
    return {
      ...cell,
      topHeight: Math.max(...pair.map((c) => c.topHeight ?? 72)),
      // Seed both panes from the taller result, without marking this as a
      // manual resize. Subsequent runs retain normal automatic sizing.
      bottomHeight: Math.max(
        ...pair.map((c) => computeCellHeights(c).bottomHeight),
      ),
    }
  })
  let y = 0
  const layout = aligned.map((cell, index) => {
    const h = computeAgentCellGridH(cell, cell.result != null)
    const item = { i: cell.id, x: (index % 2) * 6, y, w: 6, h }
    if (index % 2 === 1) y += h
    return item
  })
  return {
    cells: aligned,
    focusedCellId: aligned[0]?.id,
    settings: { layoutMode: "grid", layout },
  }
}
