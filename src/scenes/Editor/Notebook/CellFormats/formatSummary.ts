import type {
  CellVisual,
  ColumnFormat,
  FormatKind,
  Tone,
} from "../../../../utils/formats/columnFormat"

// Words for a column format, for the formats editor: what each choice is
// called, and a one-line summary of a format.

export const KIND_LABELS: Record<FormatKind, string> = {
  number: "Number",
  percent: "Percent (the value is a fraction)",
  price: "Price (fixed decimals)",
  bytes: "Bytes (KB, MB, GB)",
  duration: "Duration (the value is milliseconds)",
  text: "Text, as returned",
}

export const TONE_LABELS: Record<Tone, string> = {
  positive: "Positive (green)",
  negative: "Negative (red)",
  warning: "Warning",
  info: "Info",
  accent: "Accent",
  neutral: "Neutral",
  muted: "Muted",
  series1: "Series 1",
  series2: "Series 2",
  series3: "Series 3",
  series4: "Series 4",
  series5: "Series 5",
  series6: "Series 6",
  series7: "Series 7",
  series8: "Series 8",
}

export const CELL_VISUAL_LABELS: Record<CellVisual, string> = {
  bar: "Bar, scaled to the column's range",
  meter: "Meter, share of the column's total",
  sparkline: "Sparkline, for array values",
}

export type ColourMode = "none" | "sign" | "thresholds"

export const colourModeOf = (format: ColumnFormat): ColourMode =>
  format.thresholds && format.thresholds.length > 0
    ? "thresholds"
    : format.signTone
      ? "sign"
      : "none"

/** The format with its colouring switched to `mode`. */
export const withColourMode = (
  format: ColumnFormat,
  mode: ColourMode,
): ColumnFormat => {
  const next = { ...format }
  delete next.signTone
  if (mode !== "thresholds") {
    delete next.thresholds
    delete next.baseTone
  }
  if (mode === "sign") next.signTone = true
  if (mode === "thresholds" && !next.thresholds?.length)
    next.thresholds = [{ value: 0, tone: "positive" }]
  return next
}

/** A one-line summary, e.g. "Price · 2 decimals · $ · by sign". */
export const summarise = (format: ColumnFormat): string => {
  const parts: string[] = []
  parts.push(
    format.kind ? KIND_LABELS[format.kind].replace(/ \(.*\)$/, "") : "Number",
  )
  if (format.decimals !== undefined)
    parts.push(`${format.decimals} decimal${format.decimals === 1 ? "" : "s"}`)
  if (format.compact) parts.push("compact")
  if (format.prefix || format.suffix)
    parts.push(
      [format.prefix, format.suffix]
        .filter(Boolean)
        .map((a) => `"${a}"`)
        .join(" … "),
    )
  const mode = colourModeOf(format)
  if (mode === "sign") parts.push("coloured by sign")
  if (mode === "thresholds") {
    const n = format.thresholds?.length ?? 0
    parts.push(`${n} threshold${n === 1 ? "" : "s"}`)
  }
  if (format.visual) parts.push(`in-cell ${format.visual}`)
  return parts.join(" · ")
}

/** Drops empty fields, so an untouched editor saves nothing extra. */
export const tidyFormat = (format: ColumnFormat): ColumnFormat => {
  const next: ColumnFormat = {}
  if (format.kind) next.kind = format.kind
  if (format.decimals !== undefined) next.decimals = format.decimals
  if (format.compact) next.compact = true
  if (format.prefix) next.prefix = format.prefix
  if (format.suffix) next.suffix = format.suffix
  if (format.thresholds && format.thresholds.length > 0)
    next.thresholds = [...format.thresholds].sort((a, b) => a.value - b.value)
  else if (format.signTone) next.signTone = true
  // Below the first threshold, or for zero when coloured by sign.
  if (format.baseTone) next.baseTone = format.baseTone
  if (format.visual) next.visual = format.visual
  return next
}

/** The formats a save stores: tidied, without empty ones. */
export const tidyFormats = (
  formats: Record<string, ColumnFormat> | undefined,
): Record<string, ColumnFormat> | undefined => {
  if (!formats) return undefined
  const out: Record<string, ColumnFormat> = {}
  for (const [column, format] of Object.entries(formats)) {
    const tidy = tidyFormat(format)
    if (Object.keys(tidy).length > 0) out[column] = tidy
  }
  return Object.keys(out).length > 0 ? out : undefined
}

type Rows = {
  columns: { name: string; type: string }[]
  rows: unknown[][]
} | null

/** Every column of the results once by name, and a value of each to preview. */
export const columnsAndSamplesOf = (
  results: Rows[],
): {
  columns: { name: string; type: string }[]
  samples: Record<string, unknown>
} => {
  const columns: { name: string; type: string }[] = []
  const samples: Record<string, unknown> = {}
  for (const result of results) {
    if (!result) continue
    result.columns.forEach((column, i) => {
      if (!columns.some((c) => c.name === column.name)) columns.push(column)
      if (samples[column.name] !== undefined) return
      const row = result.rows.find((r) => r[i] !== null && r[i] !== undefined)
      if (row) samples[column.name] = row[i]
    })
  }
  return { columns, samples }
}
