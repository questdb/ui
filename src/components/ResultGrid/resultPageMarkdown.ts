import type { ColumnDefinition } from "../../utils/questdb/types"
import type { ResultGridRow } from "./types"
import { formatCellValueForCopy } from "./inlineGridUtils"

const isQueryPlanResult = (columns: ColumnDefinition[]): boolean =>
  columns.length === 1 && columns[0].name === "QUERY PLAN"

const buildQueryPlanMarkdown = (rows: ResultGridRow[]): string => {
  const lines = ["```"]
  for (const row of rows) {
    const cell = row[0]
    if (cell === null || cell === undefined) continue
    lines.push(String(cell))
  }
  lines.push("```")
  return lines.join("\n")
}

const escapeTableCell = (text: string): string =>
  text.replace(/\|/g, "\\|").replace(/\r\n|\r|\n/g, " ")

const renderRow = (cells: string[], widths: number[]): string =>
  `| ${cells.map((cell, i) => cell.padEnd(widths[i])).join(" | ")} |`

const buildTableMarkdown = (
  columns: ColumnDefinition[],
  rows: ResultGridRow[],
): string => {
  const headers = columns.map((column) => escapeTableCell(column.name))
  const widths = headers.map((header) => header.length)

  const formattedRows = rows.map((row) =>
    columns.map((column, i) => {
      const text = escapeTableCell(
        formatCellValueForCopy(row[i] ?? null, column),
      )
      widths[i] = Math.max(widths[i], text.length)
      return text
    }),
  )

  const headerRow = renderRow(headers, widths)
  const separator = `| ${widths.map((width) => "-".repeat(width)).join(" | ")} |`
  const dataRows = formattedRows.map((cells) => renderRow(cells, widths))

  return [headerRow, separator, ...dataRows].join("\n")
}

export const buildResultPageMarkdown = (
  columns: ColumnDefinition[],
  rows: ResultGridRow[],
): string => {
  if (columns.length === 0) return ""
  return isQueryPlanResult(columns)
    ? buildQueryPlanMarkdown(rows)
    : buildTableMarkdown(columns, rows)
}
