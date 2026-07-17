import type { ColumnDefinition } from "../../utils/questdb/types"
import { unescapeHtml } from "../../utils/escapeHtml"
import type { CellValue, MaxColumnWidth, ResultGridRow } from "./types"
import { theme } from "../../theme"
import {
  CELL_FONT_SIZE_PX,
  HEADER_NAME_FONT_SIZE_PX,
  HEADER_TYPE_FONT_SIZE_PX,
  CELL_PADDING_PX,
  CELL_BORDER_PX,
  HEADER_PADDING_PX,
  HEADER_GAP_PX,
  HEADER_COPY_BUTTON_PX,
  HEADER_BORDER_PX,
  MIN_COLUMN_WIDTH,
  MAX_SAMPLED_WIDTH_PX,
} from "./dimensions"

const WIDE_COLUMN_THRESHOLD_PX = 400

// Rows scroll inside a viewport that is narrower than the measured container
// when the vertical scrollbar renders, so fitting to the full container width
// would leave a permanent horizontal scrollbar.
const SCROLLBAR_ALLOWANCE_PX = 14

const HEADER_CHROME_PX =
  HEADER_PADDING_PX + HEADER_GAP_PX + HEADER_COPY_BUTTON_PX + HEADER_BORDER_PX

const CELL_CHROME_PX = CELL_PADDING_PX + CELL_BORDER_PX

const CELL_FONT = `${CELL_FONT_SIZE_PX}px ${theme.font}`
const HEADER_NAME_FONT = `${HEADER_NAME_FONT_SIZE_PX}px ${theme.font}`
const HEADER_TYPE_FONT = `${HEADER_TYPE_FONT_SIZE_PX}px ${theme.font}`

// No glyph in the cell font is narrower than punctuation, so available width
// over this advance bounds how many chars can fit.
const MIN_CHAR_ADVANCE_PX = 3

// The canvas 2D context is null outside the DOM (the node test runner); there a
// fixed per-char advance keeps sampling deterministic.
const FALLBACK_CHAR_WIDTH_PX = 9.6
const measureContext =
  typeof document === "undefined"
    ? null
    : document.createElement("canvas").getContext("2d")

let lastMeasuredFont = ""
let cellCharAdvances: Float64Array | null | undefined
let asciiCellAdvances: Float64Array | undefined
let truncatedArrayCache = new WeakMap<
  object,
  { columnWidth: number; formatted: string }
>()

// Safari resolves the canvas font at assignment time, so a face that finishes
// loading afterwards is only picked up once the font is reassigned.
export const invalidateMeasuredFont = (): void => {
  lastMeasuredFont = ""
  cellCharAdvances = undefined
  asciiCellAdvances = undefined
  truncatedArrayCache = new WeakMap()
}

const measureTextWidth = (text: string, font: string): number => {
  if (!measureContext) return text.length * FALLBACK_CHAR_WIDTH_PX
  if (font !== lastMeasuredFont) {
    measureContext.font = font
    lastMeasuredFont = font
  }
  return measureContext.measureText(text).width
}

// Numeric and timestamp values are made of these glyphs, which fonts don't
// kern, so their width is the sum of per-char advances — no canvas call per
// value. Verified per font against a real measurement; a font that fails the
// check keeps measuring every value.
const FAST_MEASURE_CHARS = "0123456789 .,:;+-eETZ"
const FAST_MEASURE_VALIDATION = "2026-01-02T03:44:55.667788Z, -1234.5e+16"

const buildCellCharAdvances = (): Float64Array | null => {
  if (!measureContext) return null
  const advances = new Float64Array(128)
  for (const char of FAST_MEASURE_CHARS) {
    advances[char.charCodeAt(0)] = measureTextWidth(char, CELL_FONT)
  }
  let sum = 0
  for (let i = 0; i < FAST_MEASURE_VALIDATION.length; i++) {
    sum += advances[FAST_MEASURE_VALIDATION.charCodeAt(i)]
  }
  const real = measureTextWidth(FAST_MEASURE_VALIDATION, CELL_FONT)
  return Math.abs(sum - real) <= 0.5 ? advances : null
}

// Kerning and ligatures only ever narrow Latin text in this font stack, so the
// per-glyph sum plus a small margin is an upper bound on the rendered width —
// tight enough that same-length values skip the canvas call entirely.
const UPPER_BOUND_MARGIN = 1.02
const FIRST_PRINTABLE_ASCII = 32
const LAST_PRINTABLE_ASCII = 126

const buildAsciiCellAdvances = (): Float64Array => {
  const advances = new Float64Array(128)
  for (let code = FIRST_PRINTABLE_ASCII; code <= LAST_PRINTABLE_ASCII; code++) {
    advances[code] = measureTextWidth(String.fromCharCode(code), CELL_FONT)
  }
  return advances
}

const cellWidthUpperBound = (text: string): number | null => {
  if (asciiCellAdvances === undefined) {
    asciiCellAdvances = buildAsciiCellAdvances()
  }
  let sum = 0
  for (let i = 0; i < text.length; i++) {
    const advance = asciiCellAdvances[text.charCodeAt(i)]
    if (!advance) return null
    sum += advance
  }
  return sum * UPPER_BOUND_MARGIN + CELL_CHROME_PX
}

const fastCellTextWidth = (text: string): number | null => {
  if (cellCharAdvances === undefined) {
    cellCharAdvances = buildCellCharAdvances()
  }
  if (cellCharAdvances === null) return null
  let sum = 0
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    const advance = code < 128 ? cellCharAdvances[code] : 0
    if (advance === 0) return null
    sum += advance
  }
  return sum
}

const LEFT_ALIGNED_TYPES = new Set(["STRING", "SYMBOL", "VARCHAR", "ARRAY"])

const FLOAT_TYPES = new Set(["FLOAT", "DOUBLE"])

const isArrayColumn = (col: ColumnDefinition): boolean => col.type === "ARRAY"

const cellWidth = (text: string): number => {
  const width = fastCellTextWidth(text) ?? measureTextWidth(text, CELL_FONT)
  return Math.max(MIN_COLUMN_WIDTH, Math.ceil(width) + CELL_CHROME_PX)
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

const fitArrayToWidth = (
  content: string,
  full: string,
  dim: number,
  available: number,
): string => {
  const maxFittingChars = Math.ceil(available / MIN_CHAR_ADVANCE_PX)
  if (
    full.length <= maxFittingChars &&
    measureTextWidth(full, CELL_FONT) <= available
  ) {
    return full
  }

  let lo = 0
  let hi = Math.min(content.length, maxFittingChars)
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    const candidate = wrapArray(`${content.slice(0, mid)}...`, dim)
    if (measureTextWidth(candidate, CELL_FONT) <= available) {
      lo = mid
    } else {
      hi = mid - 1
    }
  }
  if (lo <= 3) return full
  return wrapArray(`${content.slice(0, lo)}...`, dim)
}

const formatArrayValue = (
  value: unknown,
  col: ColumnDefinition,
  columnWidth?: number,
): string => {
  if (value === null) return "null"
  const dim = col.dim ?? 1

  if (!columnWidth) return wrapArray(arrayContent(value, dim), dim)

  const cacheable = typeof value === "object"
  if (cacheable) {
    const cached = truncatedArrayCache.get(value)
    if (cached && cached.columnWidth === columnWidth) return cached.formatted
  }

  const content = arrayContent(value, dim)
  const full = wrapArray(content, dim)
  const formatted = fitArrayToWidth(
    content,
    full,
    dim,
    columnWidth - CELL_CHROME_PX,
  )
  if (cacheable) {
    truncatedArrayCache.set(value, { columnWidth, formatted })
  }
  return formatted
}

const MAX_MEASURE_CHARS = 2000

// Wide results sample fewer rows so the sampled-cell count stays flat up to
// ~1000 columns, then holds at MIN_WIDTH_SAMPLE_ROWS rows per column.
const WIDTH_SAMPLE_CELL_BUDGET = 50000
const MIN_WIDTH_SAMPLE_ROWS = 50

// Sampling is container-independent so it runs once per result; the
// container-driven cap is applied separately by clampColumnWidths.
export const sampleColumnWidths = (
  columns: ColumnDefinition[],
  dataset: ResultGridRow[],
): number[] => {
  const rowBudget = Math.max(
    MIN_WIDTH_SAMPLE_ROWS,
    Math.floor(WIDTH_SAMPLE_CELL_BUDGET / Math.max(columns.length, 1)),
  )
  const rows =
    dataset.length > rowBudget ? dataset.slice(0, rowBudget) : dataset

  return columns.map((col, colIdx) => {
    const isArray = isArrayColumn(col)
    const headerTextPx = Math.max(
      measureTextWidth(col.name, HEADER_NAME_FONT),
      measureTextWidth(formatColumnType(col), HEADER_TYPE_FONT),
    )
    let width = Math.max(
      MIN_COLUMN_WIDTH,
      Math.ceil(headerTextPx) + HEADER_CHROME_PX,
    )

    for (const row of rows) {
      const val = row[colIdx]
      const formatted = isArray
        ? formatArrayValue(val, col)
        : formatCellValue(val, col)
      const measured =
        formatted.length > MAX_MEASURE_CHARS
          ? formatted.slice(0, MAX_MEASURE_CHARS)
          : formatted
      const upperBound = cellWidthUpperBound(measured)
      if (upperBound !== null && upperBound <= width) continue
      width = Math.max(width, cellWidth(measured))
      if (width >= MAX_SAMPLED_WIDTH_PX) {
        width = MAX_SAMPLED_WIDTH_PX
        break
      }
    }
    return Math.min(width, MAX_SAMPLED_WIDTH_PX)
  })
}

export const applyMaxColumnWidth = (
  widths: number[],
  maxColumnWidth: MaxColumnWidth,
): number[] => {
  if (maxColumnWidth === "auto") return widths
  if (widths.every((width) => width <= maxColumnWidth)) return widths
  return widths.map((width) => Math.min(width, maxColumnWidth))
}

export const clampColumnWidths = (
  widths: number[],
  containerWidth: number,
): number[] => {
  const available = containerWidth - SCROLLBAR_ALLOWANCE_PX
  const total = widths.reduce((sum, width) => sum + width, 0)
  if (total <= available) return widths

  const wideCount = widths.filter(
    (width) => width > WIDE_COLUMN_THRESHOLD_PX,
  ).length
  if (wideCount === 0) return widths

  const narrowTotal = widths.reduce(
    (sum, width) => (width <= WIDE_COLUMN_THRESHOLD_PX ? sum + width : sum),
    0,
  )
  const wideCap = Math.max(
    WIDE_COLUMN_THRESHOLD_PX,
    (available - narrowTotal) / wideCount,
  )
  return widths.map((width) => Math.min(width, wideCap))
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
    return unescapeHtml(formatArrayFull(value, col))
  }

  return unescapeHtml(formatCellValue(value, col))
}
