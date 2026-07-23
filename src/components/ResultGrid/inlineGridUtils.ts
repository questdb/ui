import type { ColumnDefinition } from "../../utils/questdb/types"
import type { CellValue, ResultGridRow } from "./types"

const CELL_WIDTH_MULTIPLIER = 9.6
const ARRAY_CELL_WIDTH_MULTIPLIER = 8.3
const MIN_COLUMN_WIDTH = 60
const MAX_WIDTH_RATIO = 0.8

// Non-text horizontal space a header cell reserves but a data cell doesn't: cell
// padding + flex gap + the always-rendered (visibility:hidden) sm copy button.
const HEADER_PADDING_PX = 32
const HEADER_GAP_PX = 6
const HEADER_COPY_BUTTON_PX = 32
const HEADER_CHROME_PX =
  HEADER_PADDING_PX + HEADER_GAP_PX + HEADER_COPY_BUTTON_PX

const LEFT_ALIGNED_TYPES = new Set(["STRING", "SYMBOL", "VARCHAR", "ARRAY"])

const FLOAT_TYPES = new Set(["FLOAT", "DOUBLE"])

const isArrayColumn = (col: ColumnDefinition): boolean => col.type === "ARRAY"

const getCellWidth = (textLength: number, isArray = false): number => {
  const multiplier = isArray
    ? ARRAY_CELL_WIDTH_MULTIPLIER
    : CELL_WIDTH_MULTIPLIER
  return Math.max(MIN_COLUMN_WIDTH, Math.ceil(textLength * multiplier))
}

const getArrayString = (value: unknown): string => {
  const json = JSON.stringify(value, (_, val: unknown) => {
    if (typeof val === "number" && Number.isInteger(val)) {
      return val.toString() + ".0"
    }
    return val
  })
  return json.replace(/"/g, "")
}

const wrapArray = (content: string, dim: number): string =>
  `ARRAY${"[".repeat(dim)}${content}${"]".repeat(dim)}`

const arrayContent = (value: unknown, dim: number): string =>
  getArrayString(value).slice(dim, -dim)

const formatArrayFull = (value: unknown, col: ColumnDefinition): string => {
  if (value === null) return "null"
  const dim = col.dim ?? 1
  return wrapArray(arrayContent(value, dim), dim)
}

const formatArrayValue = (
  value: unknown,
  col: ColumnDefinition,
  columnWidth?: number,
): string => {
  if (value === null) return "null"
  const dim = col.dim ?? 1
  const content = arrayContent(value, dim)
  const full = wrapArray(content, dim)

  if (!columnWidth) return full

  const maxArrayTextLength = Math.ceil(
    columnWidth / ARRAY_CELL_WIDTH_MULTIPLIER,
  )
  const maxContentLength = maxArrayTextLength - (dim * 2 + "ARRAY".length)

  if (content.length > maxContentLength && maxContentLength > 3) {
    return wrapArray(`${content.slice(0, maxContentLength)}...`, dim)
  }

  return full
}

// Sampling is container-independent so it runs once per result; the
// container-driven cap is applied separately by clampColumnWidths. The
// constant ceiling keeps the sampling loop bounded for very long values.
const MAX_SAMPLED_WIDTH_PX = 4000

export const WIDTH_SAMPLE_ROWS = 1000

// tanstack column ids — also the key contract of persisted column layouts.
export const COLUMN_ID_PREFIX = "col_"
export const columnId = (dataIndex: number) => `${COLUMN_ID_PREFIX}${dataIndex}`

export const sampleColumnWidths = (
  columns: ColumnDefinition[],
  dataset: ResultGridRow[],
): number[] => {
  const maxTextLenRegular = Math.ceil(
    MAX_SAMPLED_WIDTH_PX / CELL_WIDTH_MULTIPLIER,
  )
  const maxTextLenArray = Math.ceil(
    MAX_SAMPLED_WIDTH_PX / ARRAY_CELL_WIDTH_MULTIPLIER,
  )

  return columns.map((col, colIdx) => {
    const isArray = isArrayColumn(col)
    const maxTextLen = isArray ? maxTextLenArray : maxTextLenRegular
    const headerTextLen = Math.max(
      col.name.length,
      formatColumnType(col).length,
    )
    const headerTextPx = Math.ceil(headerTextLen * CELL_WIDTH_MULTIPLIER)
    let width = Math.max(MIN_COLUMN_WIDTH, headerTextPx + HEADER_CHROME_PX)

    for (const row of dataset) {
      const val = row[colIdx]
      const formatted = isArray
        ? formatArrayValue(val, col)
        : formatCellValue(val, col)
      const displayLen = Math.min(formatted.length, maxTextLen)
      width = Math.max(width, getCellWidth(displayLen, isArray))
      if (width >= MAX_SAMPLED_WIDTH_PX) {
        width = MAX_SAMPLED_WIDTH_PX
        break
      }
    }
    return Math.min(width, MAX_SAMPLED_WIDTH_PX)
  })
}

export const clampColumnWidths = (
  widths: number[],
  containerWidth: number,
): number[] => {
  const maxWidth = containerWidth * MAX_WIDTH_RATIO
  return widths.map((width) => Math.min(width, maxWidth))
}

export const isLeftAligned = (type: string): boolean =>
  LEFT_ALIGNED_TYPES.has(type.toUpperCase())

export const formatColumnType = (col: ColumnDefinition): string => {
  if (col.type !== "ARRAY") {
    return col.type.toLowerCase()
  }
  const dim = col.dim ?? 1
  const elemType = col.elemType ?? "unknown"
  if (dim > 2) {
    return `ARRAY(${elemType.toUpperCase()},${dim})`
  }
  return elemType.toLowerCase() + "[]".repeat(dim)
}

export const formatCellValue = (
  value: CellValue,
  col?: ColumnDefinition,
  columnWidth?: number,
): string => {
  if (value === null) return "null"
  if (typeof value === "boolean") return value ? "true" : "false"

  if (col && isArrayColumn(col)) {
    return formatArrayValue(value, col, columnWidth)
  }

  if (
    col &&
    typeof value === "number" &&
    FLOAT_TYPES.has(col.type.toUpperCase()) &&
    Number.isInteger(value)
  ) {
    return value.toFixed(1)
  }

  return String(value)
}

export const formatCellValueForCopy = (
  value: CellValue,
  col?: ColumnDefinition,
): string => {
  if (value === null) return "null"

  if (col && isArrayColumn(col)) {
    return formatArrayFull(value, col)
  }

  return formatCellValue(value, col)
}

export const toSingleLineDisplay = (text: string): string =>
  text.replace(/[\r\n]+/g, " ")
