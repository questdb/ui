import type { Column } from "../../utils/questdb/types"

export const truncateLongDDL = (
  ddl: string,
  maxLines: number = 10,
): { text: string; grayedOutLines: [number, number] | null } => {
  const lines = ddl.split("\n")
  if (lines.length <= maxLines) {
    return { text: ddl, grayedOutLines: null }
  }

  const keepTop = 5
  const keepBottom = 3
  const topLines = lines.slice(0, keepTop)
  const bottomLines = lines.slice(-keepBottom)

  const indent = lines[keepTop]?.match(/^\s*/)?.[0] ?? "  "
  const text = [...topLines, indent + "...", ...bottomLines].join("\n")

  const grayStartLine = keepTop - 1
  const grayEndLine = keepTop + 1

  return { text, grayedOutLines: [grayStartLine, grayEndLine] }
}

export const hideColumnsFromTableDDL = (
  ddl: string,
  columns: Column[],
): { text: string; grayedOutLines: [number, number] | null } => {
  const columnCount = columns.length
  if (columnCount <= 4) {
    return { text: ddl, grayedOutLines: null }
  }

  let columnsPart: string | null = null
  // Take content inside parantheses
  for (const match of ddl.matchAll(/\(([^)]*)\)/g)) {
    if (
      columns.every((column) =>
        match[1].includes(column.column + " " + column.type),
      )
    ) {
      columnsPart = match[1]
      break
    }
  }
  if (!columnsPart) {
    return { text: ddl, grayedOutLines: null }
  }

  const lines = columnsPart.split("\n")
  const firstColumnLineIndex = lines.findIndex((line) =>
    line.includes(columns[0].column + " " + columns[0].type),
  )
  if (firstColumnLineIndex === -1) {
    return { text: ddl, grayedOutLines: null }
  }

  const visibleLines = lines.slice(0, firstColumnLineIndex + 4)
  const lastIndex = visibleLines.length - 1
  if (!visibleLines[lastIndex].trimEnd().endsWith(",")) {
    visibleLines[lastIndex] = visibleLines[lastIndex].trimEnd() + ","
  }

  const fourthColumnLine = visibleLines[lastIndex]
  // Preserving indentation of the 4th column line, moving it to the truncation line
  const ellipsisLine = fourthColumnLine.replace(/\S.*/, "...")
  visibleLines.push(ellipsisLine)

  const columnsToShow = visibleLines.join("\n")
  const text = ddl.replace(columnsPart, columnsToShow + "\n")

  const beforeColumnsPart = ddl.substring(0, ddl.indexOf(columnsPart))
  const linesBeforeColumnsPart = beforeColumnsPart.split("\n").length - 1

  const grayStartLine = linesBeforeColumnsPart + firstColumnLineIndex + 2 + 1 // +1 for 1-based
  const grayEndLine = linesBeforeColumnsPart + visibleLines.length

  return { text, grayedOutLines: [grayStartLine, grayEndLine] }
}
