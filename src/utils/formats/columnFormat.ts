import type { ColorShape } from "../../types/styled"
import {
  asNumeric,
  compareValues,
} from "../../components/ResultGrid/highlight/comparable"

// One way to format and colour a column's values, shared by the result grid,
// charts, stat tiles, gauges, the order book and every other visual. A format
// is keyed by column name on the cell, so the same column looks the same
// wherever the cell shows it.

export const TONES = [
  "positive",
  "negative",
  "warning",
  "info",
  "accent",
  "neutral",
  "muted",
  "series1",
  "series2",
  "series3",
  "series4",
  "series5",
  "series6",
  "series7",
  "series8",
] as const

export type Tone = (typeof TONES)[number]

export const isTone = (value: unknown): value is Tone =>
  typeof value === "string" && (TONES as readonly string[]).includes(value)

export const FORMAT_KINDS = [
  "number",
  "percent",
  "price",
  "bytes",
  "duration",
  "text",
] as const

export type FormatKind = (typeof FORMAT_KINDS)[number]

export const CELL_VISUALS = ["bar", "meter", "sparkline"] as const

export type CellVisual = (typeof CELL_VISUALS)[number]

export type Threshold = { value: number; tone: Tone }

export type ColumnFormat = {
  /**
   * number: grouped digits. percent: the value is a fraction (0.05 → 5%).
   * price: fixed decimals, grouped. bytes: KB/MB/GB. duration: milliseconds
   * as ms/s/m/h. text: as returned.
   */
  kind?: FormatKind
  decimals?: number
  /** 1.2K, 3.4M, 5.6B. */
  compact?: boolean
  prefix?: string
  suffix?: string
  /** Ascending: a value at or above `value` takes `tone`. */
  thresholds?: Threshold[]
  /** Tone below the first threshold. */
  baseTone?: Tone
  /** Positive values take the positive tone, negative the negative one. */
  signTone?: boolean
  /** How a result grid cell draws the value besides its text. */
  visual?: CellVisual
}

export type ColumnFormats = Record<string, ColumnFormat>

const NUMBER_TYPES = new Set([
  "BYTE",
  "SHORT",
  "INT",
  "LONG",
  "FLOAT",
  "DOUBLE",
  "DECIMAL",
])

/**
 * What a format can do with a column of `type`: format its numbers, draw its
 * arrays as sparklines, or nothing.
 */
export const formatTargetOf = (type: string): "number" | "array" | null => {
  const t = type.toUpperCase()
  // The server reports a decimal with its precision and scale: DECIMAL(18,2).
  if (NUMBER_TYPES.has(t) || t.startsWith("DECIMAL(")) return "number"
  if (t === "ARRAY") return "array"
  return null
}

const DASH = "—"

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }
  if (typeof value === "bigint") return Number(value)
  return null
}

const groupedCache = new Map<string, Intl.NumberFormat>()

const grouped = (
  min: number,
  max: number,
  compact = false,
  style: "decimal" | "percent" = "decimal",
): Intl.NumberFormat => {
  const key = `${min}:${max}:${compact}:${style}`
  let formatter = groupedCache.get(key)
  if (!formatter) {
    formatter = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: min,
      maximumFractionDigits: max,
      style,
      ...(compact ? { notation: "compact" as const } : {}),
    })
    groupedCache.set(key, formatter)
  }
  return formatter
}

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB", "PB"]

const formatBytes = (n: number, decimals: number | undefined): string => {
  let value = Math.abs(n)
  let unit = 0
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024
    unit++
  }
  const digits = decimals ?? (unit === 0 ? 0 : 1)
  return `${n < 0 ? "-" : ""}${grouped(0, digits).format(value)} ${BYTE_UNITS[unit]}`
}

const formatDuration = (ms: number, decimals: number | undefined): string => {
  const sign = ms < 0 ? "-" : ""
  const abs = Math.abs(ms)
  if (abs < 1)
    return `${sign}${grouped(0, decimals ?? 3).format(abs * 1000)} µs`
  if (abs < 1000) return `${sign}${grouped(0, decimals ?? 1).format(abs)} ms`
  // Each unit is rounded before it is split, so a remainder that rounds up
  // carries into the larger unit (2 m 0 s, not 1 m 60 s).
  if (Number((abs / 1000).toFixed(decimals ?? 2)) < 60)
    return `${sign}${grouped(0, decimals ?? 2).format(abs / 1000)} s`
  const seconds = Math.round(abs / 1000)
  if (seconds < 3600)
    return `${sign}${Math.floor(seconds / 60)} m ${seconds % 60} s`
  const minutes = Math.round(abs / 60_000)
  return `${sign}${Math.floor(minutes / 60)} h ${minutes % 60} m`
}

const formatNumberBody = (
  n: number,
  format: ColumnFormat,
  exact: bigint | `${number}` | undefined,
): string => {
  const value = exact ?? n
  const kind = format.kind ?? "number"
  switch (kind) {
    case "percent": {
      const digits = format.decimals ?? 2
      return exact === undefined
        ? `${grouped(digits, digits, format.compact).format(n * 100)}%`
        : grouped(digits, digits, format.compact, "percent").format(exact)
    }
    case "price": {
      const digits = format.decimals ?? 2
      return grouped(digits, digits, format.compact).format(value)
    }
    case "bytes":
      return formatBytes(n, format.decimals)
    case "duration":
      return formatDuration(n, format.decimals)
    default: {
      if (format.decimals !== undefined)
        return grouped(format.decimals, format.decimals, format.compact).format(
          value,
        )
      if (format.compact) return grouped(0, 1, true).format(value)
      return Number.isInteger(n) && typeof exact !== "string"
        ? grouped(0, 0).format(value)
        : grouped(0, Math.abs(n) >= 100 ? 2 : 4).format(value)
    }
  }
}

const asText = (value: unknown): string => {
  if (typeof value === "string") return value
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  )
    return String(value)
  return JSON.stringify(value) ?? ""
}

const supportsExactDecimal =
  grouped(0, 1).format("9007199254740993.5") === "9,007,199,254,740,993.5"

/** The value as text, formatted when it is a number and the format asks to. */
export const formatValue = (
  value: unknown,
  format: ColumnFormat | undefined,
): string => {
  if (value === null || value === undefined) return DASH
  const n = format && format.kind !== "text" ? toNumber(value) : null
  if (n === null) return asText(value)
  const f = format as ColumnFormat
  let exact: bigint | `${number}` | undefined
  // QuestDB sends LONG and DECIMAL values as strings. Do not round them to
  // doubles before Intl applies the user's decimal/compact formatting.
  if (typeof value === "bigint") exact = value
  else if (typeof value === "string") {
    if (/^[+-]?\d+$/.test(value) && !Number.isSafeInteger(n))
      exact = BigInt(value)
    else if (/^[+-]?\d+\.\d+$/.test(value)) {
      if (supportsExactDecimal) exact = value as `${number}`
      else if (String(n) !== value)
        return `${f.prefix ?? ""}${value}${f.suffix ?? ""}`
    }
  }
  return `${f.prefix ?? ""}${formatNumberBody(n, f, exact)}${f.suffix ?? ""}`
}

/** True when the format changes how a number reads. */
export const formatsNumbers = (format: ColumnFormat | undefined): boolean =>
  format !== undefined && format.kind !== "text"

/** The tone a value takes from the format's thresholds or sign colouring. */
export const toneOf = (
  value: unknown,
  format: ColumnFormat | undefined,
): Tone | undefined => {
  if (!format) return undefined
  const n =
    typeof value === "bigint"
      ? value
      : typeof value === "string" || typeof value === "number"
        ? asNumeric(value)
        : null
  if (n === null) return undefined
  if (format.thresholds && format.thresholds.length > 0) {
    let tone: Tone | undefined = format.baseTone
    for (const threshold of format.thresholds) {
      if (compareValues(n, threshold.value) >= 0) tone = threshold.tone
    }
    return tone
  }
  if (format.signTone) {
    const sign = compareValues(n, 0)
    if (sign > 0) return "positive"
    if (sign < 0) return "negative"
  }
  return format.baseTone
}

const TONE_TOKENS: Record<Tone, keyof ColorShape> = {
  positive: "chartUp",
  negative: "chartDown",
  warning: "statusWarning",
  info: "statusInfo",
  accent: "contentAccent",
  neutral: "contentPrimary",
  muted: "contentMuted",
  series1: "chartSeries1",
  series2: "chartSeries2",
  series3: "chartSeries3",
  series4: "chartSeries4",
  series5: "chartSeries5",
  series6: "chartSeries6",
  series7: "chartSeries7",
  series8: "chartSeries8",
}

/** The theme colour of a tone. */
export const toneColor = (tone: Tone, colors: ColorShape): string =>
  colors[TONE_TOKENS[tone]]

/**
 * The colour of text drawn in a tone, where it differs from the tone's mark
 * colour: positive and negative marks are too light for text. Undefined for
 * other tones, so each caller keeps its own text default.
 */
export const toneTextColor = (
  tone: Tone | undefined,
  colors: ColorShape,
): string | undefined =>
  tone === "positive"
    ? colors.dataPositive
    : tone === "negative"
      ? colors.dataNegative
      : undefined

/**
 * Colour bands for a range from `min` to `max`, from the thresholds: each band
 * runs from its threshold to the next. Gauges and bullets draw these.
 */
export const thresholdBands = (
  format: ColumnFormat | undefined,
  min: number,
  max: number,
): { from: number; to: number; tone: Tone }[] => {
  const thresholds = (format?.thresholds ?? [])
    .filter((t) => t.value < max)
    .sort((a, b) => a.value - b.value)
  if (thresholds.length === 0) return []
  const bands: { from: number; to: number; tone: Tone }[] = []
  let from = min
  let tone: Tone = format?.baseTone ?? "muted"
  for (const threshold of thresholds) {
    if (threshold.value <= min) {
      tone = threshold.tone
      continue
    }
    bands.push({ from, to: threshold.value, tone })
    from = threshold.value
    tone = threshold.tone
  }
  bands.push({ from, to: max, tone })
  return bands
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

// Limits shared by the format editor, the agent tools and the importer, so
// what one accepts the others keep.
export const MAX_FORMAT_AFFIX = 16
export const MAX_FORMAT_DECIMALS = 12

/** A format read from untrusted input (imports), or undefined when unusable. */
export const sanitizeColumnFormat = (
  value: unknown,
): ColumnFormat | undefined => {
  if (!isRecord(value)) return undefined
  const format: ColumnFormat = {}
  if ((FORMAT_KINDS as readonly unknown[]).includes(value.kind))
    format.kind = value.kind as FormatKind
  if (
    typeof value.decimals === "number" &&
    Number.isInteger(value.decimals) &&
    value.decimals >= 0 &&
    value.decimals <= MAX_FORMAT_DECIMALS
  )
    format.decimals = value.decimals
  if (value.compact === true) format.compact = true
  if (typeof value.prefix === "string")
    format.prefix = value.prefix.slice(0, MAX_FORMAT_AFFIX)
  if (typeof value.suffix === "string")
    format.suffix = value.suffix.slice(0, MAX_FORMAT_AFFIX)
  if (Array.isArray(value.thresholds)) {
    const thresholds = value.thresholds
      .filter(
        (t): t is Threshold =>
          isRecord(t) &&
          typeof t.value === "number" &&
          Number.isFinite(t.value) &&
          isTone(t.tone),
      )
      .map((t) => ({ value: t.value, tone: t.tone }))
      .sort((a, b) => a.value - b.value)
    if (thresholds.length > 0) format.thresholds = thresholds
  }
  if (isTone(value.baseTone)) format.baseTone = value.baseTone
  if (value.signTone === true) format.signTone = true
  if ((CELL_VISUALS as readonly unknown[]).includes(value.visual))
    format.visual = value.visual as CellVisual
  return format
}

export const sanitizeColumnFormats = (
  value: unknown,
): ColumnFormats | undefined => {
  if (!isRecord(value)) return undefined
  const out: ColumnFormats = {}
  for (const [column, raw] of Object.entries(value)) {
    if (column === "__proto__" || column === "constructor") continue
    const format = sanitizeColumnFormat(raw)
    if (format) out[column] = format
  }
  return Object.keys(out).length > 0 ? out : undefined
}
