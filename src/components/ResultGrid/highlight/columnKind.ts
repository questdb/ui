import type { ColumnDefinition } from "../../../utils/questdb/types"

export type ColumnKind = "numeric" | "temporal" | "text" | "boolean" | "other"

const NUMERIC = new Set([
  "DOUBLE",
  "FLOAT",
  "INT",
  "LONG",
  "SHORT",
  "BYTE",
  "DECIMAL",
])
const TEMPORAL = new Set(["TIMESTAMP", "TIMESTAMP_NS", "DATE"])
const TEXT = new Set(["SYMBOL", "STRING", "VARCHAR", "CHAR"])

export const columnKindOf = (column: ColumnDefinition): ColumnKind => {
  const type = column.type?.toUpperCase() ?? ""
  if (NUMERIC.has(type)) return "numeric"
  if (TEMPORAL.has(type)) return "temporal"
  if (TEXT.has(type)) return "text"
  if (type === "BOOLEAN") return "boolean"
  return "other"
}
