import type { QueryExecResult } from "../../../hooks/useQueryExecution"
import type {
  CellLayoutItem,
  CellMode,
  CellResult,
  NotebookCell,
  NotebookViewState,
  SingleQueryResult,
} from "../../../store/notebook"
import { createCell } from "../../../store/notebook"
import type { ChartConfig } from "./CellChart/chartTypes"

export const singleResultFromExec = (
  exec: QueryExecResult,
  query: string,
): SingleQueryResult => {
  switch (exec.type) {
    case "dql":
      return {
        type: "dql",
        query,
        columns: exec.columns,
        dataset: exec.dataset,
        count: exec.count,
        timings: exec.timings,
      }
    case "error":
      return { type: "error", query, error: exec.error ?? "Unknown error" }
    default:
      return { type: exec.type, query }
  }
}

export const stripCellResults = (cells: NotebookCell[]): NotebookCell[] =>
  cells.map((cell) => ({ ...cell, result: undefined }))

export const buildPersistPayload = (
  cells: NotebookCell[],
  focusedCellId: string | null,
  maximizedCellId: string | null,
  settings: NotebookViewState["settings"],
): NotebookViewState => ({
  cells: stripCellResults(cells),
  focusedCellId: focusedCellId ?? undefined,
  maximizedCellId: maximizedCellId ?? undefined,
  settings,
})

type MergeLayoutOptions = {
  gridCols: number
  defaultCellH: number
  minW: number
  minH: number
}

export const mergeCellLayout = (
  savedLayout: CellLayoutItem[],
  cells: { id: string }[],
  opts: MergeLayoutOptions,
): (CellLayoutItem & { minW: number; minH: number })[] => {
  const layoutMap = new Map(savedLayout.map((l) => [l.i, l]))
  const maxY =
    savedLayout.length > 0 ? Math.max(...savedLayout.map((l) => l.y + l.h)) : 0
  let nextY = maxY
  return cells.map((cell) => {
    const existing = layoutMap.get(cell.id)
    if (existing) {
      return { ...existing, minW: opts.minW, minH: opts.minH }
    }
    const item = {
      i: cell.id,
      x: 0,
      y: nextY,
      w: opts.gridCols,
      h: opts.defaultCellH,
      minW: opts.minW,
      minH: opts.minH,
    }
    nextY += opts.defaultCellH
    return item
  })
}

export const generateDefaultLayout = (
  cells: { id: string }[],
  opts: Pick<MergeLayoutOptions, "gridCols" | "defaultCellH">,
): CellLayoutItem[] =>
  cells.map((cell, i) => ({
    i: cell.id,
    x: 0,
    y: i * opts.defaultCellH,
    w: opts.gridCols,
    h: opts.defaultCellH,
  }))

// Identity-preserving so React.memo'd siblings skip re-render when one
// cell is added or removed.
const reindex = (cells: NotebookCell[]): NotebookCell[] =>
  cells.map((c, i) => (c.position === i ? c : { ...c, position: i }))

export const insertCell = (
  cells: NotebookCell[],
  afterCellId: string | undefined,
  factory: typeof createCell = createCell,
  override?: { id?: string; value?: string },
): NotebookCell[] => {
  const insertIndex =
    afterCellId !== undefined
      ? cells.findIndex((c) => c.id === afterCellId) + 1
      : cells.length
  const base = factory(insertIndex, override?.value ?? "")
  const patch: Partial<NotebookCell> = {}
  if (override?.id) patch.id = override.id
  if (override?.value !== undefined) patch.value = override.value
  const newCell: NotebookCell =
    Object.keys(patch).length > 0 ? { ...base, ...patch } : base
  const next = [...cells]
  next.splice(insertIndex, 0, newCell)
  return reindex(next)
}

export const removeCell = (
  cells: NotebookCell[],
  cellId: string,
): NotebookCell[] => {
  if (cells.length <= 1) return cells
  const found = cells.some((c) => c.id === cellId)
  if (!found) return cells
  return reindex(cells.filter((c) => c.id !== cellId))
}

export const swapCellUp = (
  cells: NotebookCell[],
  cellId: string,
): NotebookCell[] => {
  const idx = cells.findIndex((c) => c.id === cellId)
  if (idx <= 0) return cells
  const next = [...cells]
  ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
  return reindex(next)
}

export const swapCellDown = (
  cells: NotebookCell[],
  cellId: string,
): NotebookCell[] => {
  const idx = cells.findIndex((c) => c.id === cellId)
  if (idx < 0 || idx >= cells.length - 1) return cells
  const next = [...cells]
  ;[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
  return reindex(next)
}

export const duplicateCellAt = (
  cells: NotebookCell[],
  cellId: string,
  newId: string,
): NotebookCell[] => {
  const idx = cells.findIndex((c) => c.id === cellId)
  if (idx < 0) return cells
  const original = cells[idx]
  const copy: NotebookCell = {
    ...original,
    id: newId,
    position: idx + 1,
    result: null,
  }
  const next = [...cells]
  next.splice(idx + 1, 0, copy)
  return reindex(next)
}

export const setResultAt = (
  cells: NotebookCell[],
  cellId: string,
  index: number,
  result: SingleQueryResult,
  activeIndex?: number,
): NotebookCell[] =>
  cells.map((c) => {
    if (c.id !== cellId || !c.result) return c
    const results = [...c.result.results]
    results[index] = result
    const nextCellResult: CellResult = {
      ...c.result,
      results,
      ...(activeIndex !== undefined && { activeResultIndex: activeIndex }),
    }
    return { ...c, result: nextCellResult }
  })

export const cancelAllInCell = (
  cells: NotebookCell[],
  cellId: string,
): NotebookCell[] =>
  cells.map((c) => {
    if (c.id !== cellId || !c.result) return c
    return {
      ...c,
      result: {
        ...c.result,
        results: c.result.results.map((r) =>
          r.type === "running" || r.type === "queued"
            ? { type: "cancelled", query: r.query }
            : r,
        ),
      },
    }
  })

export const cancelOneInCell = (
  cells: NotebookCell[],
  cellId: string,
  index: number,
): NotebookCell[] =>
  cells.map((c) => {
    if (c.id !== cellId || !c.result) return c
    const results = [...c.result.results]
    const target = results[index]
    if (target?.type !== "running") return c
    results[index] = { type: "cancelled", query: target.query }
    return { ...c, result: { ...c.result, results } }
  })

export const buildInitialScriptResults = (
  queries: string[],
): SingleQueryResult[] =>
  queries.map((q, i) => ({
    type: i === 0 ? "running" : "queued",
    query: q,
  }))

type ApplyCellRequest = {
  id?: string | null
  value: string
  mode?: CellMode | null
  autoRefresh?: boolean | null
  isChartMaximized?: boolean | null
  chartConfig?: ChartConfig | null
  grid?: { x: number; y: number; w: number; h: number } | null
}

type ApplyRequest = {
  layoutMode?: "list" | "grid" | null
  maximizedCellId?: string | null
  cells: ApplyCellRequest[]
}

type AppliedDiff = {
  added: string[]
  updated: string[]
  deleted: string[]
}

export class ApplyNotebookStateError extends Error {
  readonly field?: string
  constructor(message: string, field?: string) {
    super(message)
    this.name = "ApplyNotebookStateError"
    this.field = field
  }
}

const generateId = (): string =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)

const normalizeChartConfig = (
  cfg: ChartConfig | null | undefined,
): ChartConfig | undefined => {
  if (!cfg) return undefined
  const next: ChartConfig = {
    type: cfg.type,
    xColumn: cfg.xColumn ?? null,
    yColumns: cfg.yColumns ?? [],
  }
  if (cfg.partitionByColumn) next.partitionByColumn = cfg.partitionByColumn
  if (cfg.name) next.name = cfg.name
  if (cfg.ohlc) {
    next.ohlc = cfg.ohlc
  } else if (
    cfg.type === "candlestick" &&
    cfg.yColumns &&
    cfg.yColumns.length === 4
  ) {
    const [open, high, low, close] = cfg.yColumns
    next.ohlc = { open, high, low, close }
  }
  return next
}

export const buildAppliedCells = (
  prev: NotebookCell[],
  request: ApplyRequest,
): { nextCells: NotebookCell[]; diff: AppliedDiff } => {
  const prevById = new Map(prev.map((c) => [c.id, c]))
  const seenIds = new Set<string>()
  const added: string[] = []
  const updated: string[] = []

  const nextCells: NotebookCell[] = request.cells.map((req, index) => {
    const requestedId =
      typeof req.id === "string" && req.id.length > 0 ? req.id : undefined
    if (requestedId && seenIds.has(requestedId)) {
      throw new ApplyNotebookStateError(
        `Duplicate cell id "${requestedId}" in request.`,
        "cells",
      )
    }

    const existing = requestedId ? prevById.get(requestedId) : undefined
    const id = requestedId ?? generateId()
    if (requestedId && !existing) seenIds.add(requestedId)
    else if (!existing) seenIds.add(id)
    else seenIds.add(existing.id)

    const resolvedMode: CellMode | undefined =
      req.mode === undefined || req.mode === null ? existing?.mode : req.mode

    const chartConfig = normalizeChartConfig(
      req.chartConfig ?? existing?.chartConfig,
    )

    if (resolvedMode === "draw" && !chartConfig) {
      throw new ApplyNotebookStateError(
        `Cell at index ${index} has mode='draw' but no chart_config.`,
        "cells",
      )
    }
    if (chartConfig?.type === "candlestick" && !chartConfig.ohlc) {
      throw new ApplyNotebookStateError(
        `Cell at index ${index} has chart_config.type='candlestick' but no ohlc mapping.`,
        "cells",
      )
    }

    const isDraw = resolvedMode === "draw"
    const isChartMaximized =
      req.isChartMaximized !== undefined && req.isChartMaximized !== null
        ? req.isChartMaximized
        : (existing?.isChartMaximized ?? (isDraw ? true : undefined))
    const autoRefresh =
      req.autoRefresh !== undefined && req.autoRefresh !== null
        ? req.autoRefresh
        : (existing?.autoRefresh ?? (isDraw ? true : undefined))

    if (existing) {
      updated.push(existing.id)
      const valueChanged = existing.value !== req.value
      const next: NotebookCell = {
        ...existing,
        id: existing.id,
        position: index,
        value: req.value,
        result: valueChanged ? null : existing.result,
      }
      if (resolvedMode !== undefined) next.mode = resolvedMode
      else delete next.mode
      if (chartConfig !== undefined) next.chartConfig = chartConfig
      else delete next.chartConfig
      if (autoRefresh !== undefined) next.autoRefresh = autoRefresh
      else delete next.autoRefresh
      if (isChartMaximized !== undefined)
        next.isChartMaximized = isChartMaximized
      else delete next.isChartMaximized
      return next
    }

    added.push(id)
    const created: NotebookCell = {
      id,
      position: index,
      value: req.value,
    }
    if (resolvedMode !== undefined) created.mode = resolvedMode
    if (chartConfig !== undefined) created.chartConfig = chartConfig
    if (autoRefresh !== undefined) created.autoRefresh = autoRefresh
    if (isChartMaximized !== undefined)
      created.isChartMaximized = isChartMaximized
    return created
  })

  if (nextCells.length === 0) {
    throw new ApplyNotebookStateError(
      "Request cells array is empty; a notebook must have at least one cell.",
      "cells",
    )
  }

  const deleted = prev.filter((c) => !seenIds.has(c.id)).map((c) => c.id)

  return { nextCells, diff: { added, updated, deleted } }
}

// 12-column grid units; ROW_HEIGHT (Notebook/index.tsx) is 50 px. 8 ≈ 400 px
// (run: editor + ~3 result rows), 10 ≈ 500 px (draw: chart room).
const BULK_DEFAULT_RUN_CELL_H = 8
const BULK_DEFAULT_DRAW_CELL_H = 10

export const minHeightForMode = (mode: "run" | "draw" | undefined): number =>
  mode === "draw" ? BULK_DEFAULT_DRAW_CELL_H : BULK_DEFAULT_RUN_CELL_H

export const buildAppliedLayout = (
  request: ApplyRequest,
  nextCells: NotebookCell[],
  prevLayout: CellLayoutItem[] | undefined,
  defaults: { gridCols: number; defaultCellH: number },
): CellLayoutItem[] => {
  const prevById = new Map((prevLayout ?? []).map((l) => [l.i, l]))
  let nextY = 0
  return nextCells.map((cell, i) => {
    const req = request.cells[i]
    if (req?.grid) {
      const item = { i: cell.id, ...req.grid }
      nextY = Math.max(nextY, req.grid.y + req.grid.h)
      return item
    }
    const existing = prevById.get(cell.id)
    if (existing) {
      nextY = Math.max(nextY, existing.y + existing.h)
      return existing
    }
    const cellH = minHeightForMode(cell.mode)
    const item: CellLayoutItem = {
      i: cell.id,
      x: 0,
      y: nextY,
      w: defaults.gridCols,
      h: cellH,
    }
    nextY += cellH
    return item
  })
}

export const attachScriptSummary = (
  cells: NotebookCell[],
  cellId: string,
  summary: NonNullable<CellResult["script"]>,
): NotebookCell[] =>
  cells.map((c) => {
    if (c.id !== cellId || !c.result) return c
    return { ...c, result: { ...c.result, script: summary } }
  })
