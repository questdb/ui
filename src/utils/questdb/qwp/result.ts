import type {
  QwpQueryStats,
  QwpResultBatch,
  QwpResultColumn,
  QwpResultValue,
} from "@questdb/browser-client"
import type { ColumnDefinition, DatasetType, Timings } from "../types"
import {
  cellFormatter,
  columnDefinition,
  isArrayColumn,
  sameAsExec,
  type CellFormatter,
} from "./format"

export type RowWindow = { skipRows: number; maxRows?: number }

const INTEGER = /^-?\d+$/

// Numbers.parseLong() of the `limit` text, which throws on anything else.
const parseLong = (text: string) => {
  if (!INTEGER.test(text)) throw new RangeError(text)
  return Number(text)
}

/**
 * The rows `/exec` returns for its `limit` parameter: `hi` alone, or `lo,hi`
 * with a one-based `lo`. Parsed as the server does, including its fallback to
 * the defaults on malformed text.
 */
export const parseLimit = (limit: string | undefined): RowWindow => {
  let skip = 0
  let stop = Number.POSITIVE_INFINITY
  if (limit !== undefined) {
    const separator = limit.indexOf(",")
    try {
      if (separator > 0) {
        skip = parseLong(limit.slice(0, separator)) - 1
        if (separator + 1 < limit.length) {
          stop = parseLong(limit.slice(separator + 1))
        }
      } else {
        stop = parseLong(limit)
      }
    } catch {
      // The server keeps whatever it parsed before the malformed part.
    }
  }
  skip = Math.max(skip, 0)
  stop = Math.max(stop, 0)
  return stop === Number.POSITIVE_INFINITY
    ? { skipRows: skip }
    : { skipRows: skip, maxRows: Math.max(stop - skip, 0) }
}

const firstArrayDimensions = (values: readonly QwpResultValue[]) => {
  for (const value of values) {
    if (value !== null && typeof value === "object" && "dimensions" in value) {
      return value.dimensions.length
    }
  }
  return undefined
}

/** Accumulates a query's result batches as `/exec` columns and dataset. */
export class QwpResultCollector {
  readonly dataset: DatasetType[] = []
  private schema?: readonly QwpResultColumn[]
  private formatters: CellFormatter[] = []
  private arrayDimensions: (number | undefined)[] = []

  add(batch: QwpResultBatch) {
    const { columns, rowCount } = batch
    if (!this.schema) {
      this.schema = columns
      this.formatters = columns.map(cellFormatter)
    }
    const start = this.dataset.length
    for (let row = 0; row < rowCount; row++) {
      this.dataset.push(new Array(columns.length) as DatasetType)
    }
    for (let index = 0; index < columns.length; index++) {
      const { type, values } = columns[index]
      if (
        this.arrayDimensions[index] === undefined &&
        isArrayColumn(type) &&
        rowCount > 0
      ) {
        this.arrayDimensions[index] = firstArrayDimensions(values)
      }
      const format = this.formatters[index]
      // ExecCell is what JSON.parse returns: DatasetType understates it.
      const cells = values as DatasetType
      if (format === sameAsExec) {
        for (let row = 0; row < rowCount; row++) {
          this.dataset[start + row][index] = cells[row]
        }
      } else {
        for (let row = 0; row < rowCount; row++) {
          this.dataset[start + row][index] = format(
            values[row],
          ) as DatasetType[0]
        }
      }
    }
  }

  get columns(): ColumnDefinition[] {
    return (this.schema ?? []).map((column, index) =>
      columnDefinition(column, this.arrayDimensions[index]),
    )
  }
}

/**
 * `/exec` timings from QWP statistics. `/exec` starts its execution timer once
 * the query is compiled, while QWP's covers the whole request.
 */
export const timingsFromStats = (
  stats: QwpQueryStats | undefined,
  fetchNanos: number,
): Timings => ({
  authentication: 0,
  compiler: stats ? Number(stats.compileNanos) : 0,
  execute: stats
    ? Math.max(Number(stats.executeNanos - stats.compileNanos), 0)
    : 0,
  count: stats ? Number(stats.countNanos) : 0,
  fetch: fetchNanos,
})
