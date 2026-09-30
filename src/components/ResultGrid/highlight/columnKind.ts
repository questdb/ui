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

// The server reports a decimal column with its precision and scale, as in
// DECIMAL(10,3).
const isDecimal = (type: string) => type.startsWith("DECIMAL(")

export const columnKindOf = (column: ColumnDefinition): ColumnKind => {
  const type = column.type?.toUpperCase() ?? ""
  if (NUMERIC.has(type) || isDecimal(type)) return "numeric"
  if (TEMPORAL.has(type)) return "temporal"
  if (TEXT.has(type)) return "text"
  if (type === "BOOLEAN") return "boolean"
  return "other"
}
