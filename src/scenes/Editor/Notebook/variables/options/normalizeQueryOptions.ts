import type {
  ListVariable,
  VariableOption,
} from "../../../../../store/notebook"
import type { ColumnDefinition } from "../../../../../utils/questdb/types"
import { deriveListOptions } from "../listOptions"
import { filterOptionsWithRegex } from "./regexFilter"

export const MAX_OPTIONS = 10_000

const BARE_TYPES = new Set([
  "BYTE",
  "SHORT",
  "INT",
  "LONG",
  "FLOAT",
  "DOUBLE",
  "BOOLEAN",
])

export type QueryRows = {
  columns: ColumnDefinition[]
  rows: (boolean | string | number | null)[][]
  truncated: boolean
}

export type NormalizeQueryOptionsResult =
  | { kind: "ready"; options: VariableOption[]; warnings: string[] }
  | { kind: "error"; error: string }

export const sqlStringLiteral = (value: string): string =>
  `'${value.replace(/'/g, "''")}'`

const labelIndex = (
  columns: ColumnDefinition[],
  name: string | undefined,
): number | null => {
  if (name === undefined) return null
  const index = columns.findIndex((column) => column.name === name)
  return index < 0 ? null : index
}

const cellText = (value: boolean | string | number | null): string | null =>
  value === null ? null : String(value)

export const normalizeQueryOptions = async (
  rows: QueryRows,
  variable: ListVariable & { source: { type: "query" } },
  signal: AbortSignal,
): Promise<NormalizeQueryOptionsResult> => {
  const { columns } = rows
  if (columns.length === 0) return { kind: "ready", options: [], warnings: [] }
  const valueIndex = 0
  const label = labelIndex(columns, variable.source.labelColumn)
  const bare = BARE_TYPES.has(columns[valueIndex].type.toUpperCase())
  let nulls = 0
  const mapped: VariableOption[] = []
  for (const row of rows.rows) {
    const value = cellText(row[valueIndex])
    if (value === null) {
      nulls += 1
      continue
    }
    const text = label === null ? null : cellText(row[label])
    mapped.push({ value, label: text ?? value })
  }
  const filtered = await filterOptionsWithRegex(
    mapped,
    variable.source.regex,
    signal,
  )
  if (filtered.kind === "error") return filtered
  const options = deriveListOptions(variable, filtered.options).map((option) =>
    bare ? option : { ...option, value: sqlStringLiteral(option.value) },
  )
  const duplicates = mapped.length - new Set(mapped.map((o) => o.value)).size
  const warnings: string[] = []
  if (rows.truncated) {
    warnings.push(
      `More than ${MAX_OPTIONS.toLocaleString()} values. Add DISTINCT, a WHERE filter, or a LIMIT.`,
    )
  }
  if (duplicates > 0) {
    warnings.push(
      `${duplicates} duplicate value${duplicates === 1 ? "" : "s"} removed. Add DISTINCT to the query.`,
    )
  }
  if (nulls > 0) {
    warnings.push(`${nulls} null value${nulls === 1 ? "" : "s"} skipped.`)
  }
  return { kind: "ready", options, warnings }
}
