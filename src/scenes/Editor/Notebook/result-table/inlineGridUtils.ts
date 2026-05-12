import type { ColumnDefinition } from "../../../../utils/questdb/types"

const CELL_WIDTH_MULTIPLIER = 9.6
const ARRAY_CELL_WIDTH_MULTIPLIER = 8.3
const MIN_COLUMN_WIDTH = 60
const MAX_WIDTH_RATIO = 0.5

const LEFT_ALIGNED_TYPES = new Set(["STRING", "SYMBOL", "VARCHAR", "ARRAY"])

const FLOAT_TYPES = new Set(["FLOAT", "DOUBLE"])

const isArrayColumn = (col: ColumnDefinition): boolean => col.type === "ARRAY"

const getCellWidth = (textLength: number, isArray = false): number => {
  const multiplier = isArray
    ? ARRAY_CELL_WIDTH_MULTIPLIER
    : CELL_WIDTH_MULTIPLIER
  return Math.max(MIN_COLUMN_WIDTH, Math.ceil(textLength * multiplier))
}

// Matches grid.js getArrayString: float .0 suffix for ints in float arrays, quotes stripped from strings.
const getArrayString = (value: unknown, isFloatElem: boolean): string => {
  const json = JSON.stringify(value, (_, val: unknown) => {
    if (typeof val === "number" && isFloatElem && Number.isInteger(val)) {
      return val.toString() + ".0"
    }
    return val
  })
  return json.replace(/"/g, "")
}

const formatArrayFull = (value: unknown, col: ColumnDefinition): string => {
  if (value === null) return "null"
  const dim = col.dim ?? 1
  const isFloatElem =
    col.elemType != null && FLOAT_TYPES.has(col.elemType.toUpperCase())

  const arrayString = getArrayString(value, isFloatElem)
  const content = arrayString.slice(dim, -dim)
  return `ARRAY${"[".repeat(dim)}${content}${"]".repeat(dim)}`
}

// Matches grid.js getDisplayedCellValue: truncates content with "..." preserving ARRAY[...] structure.
const formatArrayValue = (
  value: unknown,
  col: ColumnDefinition,
  columnWidth?: number,
): string => {
  if (value === null) return "null"
  const dim = col.dim ?? 1
  const isFloatElem =
    col.elemType != null && FLOAT_TYPES.has(col.elemType.toUpperCase())

  const arrayString = getArrayString(value, isFloatElem)
  const content = arrayString.slice(dim, -dim)
  const full = `ARRAY${"[".repeat(dim)}${content}${"]".repeat(dim)}`

  if (!columnWidth) return full

  const maxArrayTextLength = Math.ceil(
    columnWidth / ARRAY_CELL_WIDTH_MULTIPLIER,
  )
  // Subtract "ARRAY" (5) + opening brackets (dim) + closing brackets (dim).
  const maxContentLength = maxArrayTextLength - (dim * 2 + 5)

  if (content.length > maxContentLength && maxContentLength > 3) {
    const truncated = content.slice(0, maxContentLength)
    return `ARRAY${"[".repeat(dim)}${truncated}...${"[".repeat(0)}${"]".repeat(dim)}`
  }

  return full
}

export const computeColumnWidths = (
  columns: ColumnDefinition[],
  dataset: (boolean | string | number | null)[][],
  containerWidth: number,
): number[] => {
  const maxWidth = containerWidth * MAX_WIDTH_RATIO
  const maxTextLenRegular = Math.ceil(maxWidth / CELL_WIDTH_MULTIPLIER)
  const maxTextLenArray = Math.ceil(maxWidth / ARRAY_CELL_WIDTH_MULTIPLIER)

  return columns.map((col, colIdx) => {
    const isArray = isArrayColumn(col)
    const maxTextLen = isArray ? maxTextLenArray : maxTextLenRegular
    const headerLen = col.name.length + formatColumnType(col).length
    let w = getCellWidth(headerLen, isArray)

    for (const row of dataset) {
      const val = row[colIdx]
      let displayLen: number
      if (isArray) {
        const formatted = formatArrayValue(val, col)
        displayLen = Math.min(formatted.length, maxTextLen)
      } else {
        const formatted = formatCellValue(val, col)
        displayLen = Math.min(formatted.length, maxTextLen)
      }
      w = Math.max(w, getCellWidth(displayLen, isArray))
      if (w >= maxWidth) {
        w = maxWidth
        break
      }
    }
    return Math.min(w, maxWidth)
  })
}

export const isLeftAligned = (type: string): boolean =>
  LEFT_ALIGNED_TYPES.has(type.toUpperCase())

export const isTimestampColumn = (type: string): boolean =>
  type.toUpperCase() === "TIMESTAMP"

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
  value: boolean | string | number | null,
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
  value: boolean | string | number | null,
  col?: ColumnDefinition,
): string => {
  if (value === null) return "null"

  if (col && isArrayColumn(col)) {
    return formatArrayFull(value, col)
  }

  return formatCellValue(value, col)
}
