import type { EChartsOption } from "echarts"
import type { ColumnDefinition } from "../../../../utils/questdb/types"
import type {
  AxisBounds,
  CandlePalette,
  ChartType,
  SeriesAxis,
} from "./chartTypes"
import { MAX_PARTITION_SERIES, classifyColumn } from "./inferChartConfig"

type Dataset = (boolean | string | number | null)[][]

export type ResolvedQuery = {
  index: number
  columns: ColumnDefinition[]
  dataset: Dataset
  xColumn: string | null // for value extraction
  type: ChartType
  yColumns: string[]
  ohlc?: { open: string; high: string; low: string; close: string }
  volume?: string
  partitionByColumn?: string
  axis: SeriesAxis
  name?: string
}

export type ChartViewport = { height: number }

export type ChartGlobals = {
  xColumn: string | null
  leftAxis?: AxisBounds
  rightAxis?: AxisBounds
}

type Series = Record<string, unknown>

type XMode = "time" | "value" | "category"

type SeriesContext = {
  xMode: XMode
  categoryUnion: string[] | null // set only when overlaying series onto a shared category axis; null for a single positional query
}

const DATAZOOM_THRESHOLD = 200

const LEGEND_BOTTOM = 3
const SLIDER_HEIGHT = 18
const SLIDER_BOTTOM = 40
const GRID_BOTTOM_NO_ZOOM = 56
const GRID_BOTTOM_WITH_ZOOM = 86
const CHART_FONT_SIZE = 12
const BAR_OVERLAY_OPACITY = 0.45
const X_AXIS_NAME_GAP = 26
const VOLUME_PANE_SHARE = 0.2
const VOLUME_PANE_MIN_HEIGHT = 48
const VOLUME_PANE_GAP = 5
const VOLUME_BAR_OPACITY = 0.7
const VOLUME_BAR_MIN_HEIGHT = 1
const VOLUME_AXIS_PAD = 0.1
const OUTLIER_FENCE = 3
const QUIET_BUCKET_TOLERANCE = 0.05

const quantile = (sorted: number[], q: number): number =>
  sorted[Math.floor(q * (sorted.length - 1))]

const volumeAxisBounds = (
  queries: ResolvedQuery[],
): { min: number; max: number } | null => {
  const values: number[] = []
  for (const q of queries) {
    const vIdx =
      q.volume != null
        ? buildColumnIndexMap(q.columns).get(q.volume)
        : undefined
    if (vIdx === undefined) continue
    for (const row of q.dataset) {
      const v = toNumberOrNull(row[vIdx])
      if (v !== null) values.push(v)
    }
  }
  if (values.length === 0) return null
  values.sort((a, b) => a - b)
  const max = values[values.length - 1]
  if (max <= 0) return null
  // A bar far under the pack, such as the bucket still filling, is an outlier
  // and is drawn as a stub. Two guards decide "far": Tukey's outer fence, 3 IQR
  // under the lower quartile, which keeps everything on spiky data, and a 5%
  // band under that quartile, which protects a genuine quiet bucket when the
  // pack is so tight that a few IQR is a rounding error.
  const q1 = quantile(values, 0.25)
  const outlierCutoff = Math.min(
    q1 - OUTLIER_FENCE * (quantile(values, 0.75) - q1),
    q1 * (1 - QUIET_BUCKET_TOLERANCE),
  )
  const smallestKept = values.find((v) => v >= outlierCutoff) ?? values[0]
  const pad = (max - smallestKept) * VOLUME_AXIS_PAD
  return { min: Math.max(0, smallestKept - pad), max: max + pad }
}

const PANE_AXIS_LABEL_SPACE = 22
const PANE_LEFT = 76
const PANE_RIGHT = 64

const compactNumber = (value: number): string => {
  const abs = Math.abs(value)
  const [divisor, suffix] =
    abs >= 1e9
      ? [1e9, "B"]
      : abs >= 1e6
        ? [1e6, "M"]
        : abs >= 1e3
          ? [1e3, "k"]
          : [1, ""]
  const scaled = value / divisor
  return `${Number.isInteger(scaled) ? scaled : scaled.toFixed(1)}${suffix}`
}

const buildColumnIndexMap = (
  columns: ColumnDefinition[],
): Map<string, number> => {
  const m = new Map<string, number>()
  columns.forEach((c, i) => m.set(c.name, i))
  return m
}

const pinnedBounds = (axis: AxisBounds | undefined) => ({
  ...(axis?.min != null ? { min: axis.min } : {}),
  ...(axis?.max != null ? { max: axis.max } : {}),
})

const toNumberOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined) return null
  if (typeof v === "number") return v
  if (typeof v === "boolean") return v ? 1 : 0
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const toCategoryLabel = (v: unknown): string => {
  if (v === null || v === undefined) return ""
  if (typeof v === "string") return v
  if (typeof v === "number" || typeof v === "boolean") return String(v)
  return JSON.stringify(v)
}

const extractColumnValues = (dataset: Dataset, idx: number): unknown[] =>
  dataset.map((row) => row[idx])

const resolveSeriesRenderSpec = (type: ChartType) => {
  const isStep = type === "stepLine" || type === "stepArea"
  const isArea = type === "area" || type === "stepArea"
  const isLineFamily =
    type === "line" ||
    type === "area" ||
    type === "stepLine" ||
    type === "stepArea"
  const isStacked = type === "stackedBar"
  const isScatter = type === "scatter"
  const seriesType: "line" | "bar" | "scatter" = isScatter
    ? "scatter"
    : isLineFamily
      ? "line"
      : "bar"
  const lineExtras: Record<string, unknown> = {}
  if (isArea) {
    lineExtras.areaStyle = {}
    lineExtras.symbol = "none"
  }
  if (isStep) lineExtras.step = "end"
  // Scatter/bar use `large` for big point/bar sets; lines downsample with LTTB.
  const perfExtras: {
    sampling?: "lttb"
    large?: boolean
    animation?: boolean
  } = isLineFamily
    ? { sampling: "lttb", animation: false }
    : isScatter
      ? { large: true, animation: false }
      : { large: true }
  return { seriesType, lineExtras, perfExtras, isStacked, isStep }
}

type ValuePoint = (number | null)[]

const LINE_FAMILY: ReadonlySet<ChartType> = new Set([
  "line",
  "area",
  "stepLine",
  "stepArea",
])

// Lines over a numeric x span the data edge to edge, as a time axis does.
// Scatter and bar keep the rounded padding so edge marks are not clipped, and
// a single x value keeps it because a zero-width axis draws nothing.
const fitsValueAxisToData = (queries: ResolvedQuery[]): boolean => {
  if (!queries.every((q) => LINE_FAMILY.has(q.type))) return false
  const xs = new Set<number>()
  for (const q of queries) {
    const xIdx =
      q.xColumn != null
        ? buildColumnIndexMap(q.columns).get(q.xColumn)
        : undefined
    if (xIdx === undefined) continue
    for (const row of q.dataset) {
      const x = toNumberOrNull(row[xIdx])
      if (x != null) xs.add(x)
      if (xs.size > 1) return true
    }
  }
  return false
}

const byX = (a: ValuePoint, b: ValuePoint): number => {
  if (a[0] == null) return b[0] == null ? 0 : 1
  if (b[0] == null) return -1
  return a[0] - b[0]
}

// A step series holds each value until the next point's x, so the last point
// of every non-null run has zero width. Give it one more interval to hold.
const holdStepRunEnds = (points: ValuePoint[]): ValuePoint[] => {
  const xs = points.map((p) => p[0]).filter((x): x is number => x != null)
  let interval = Infinity
  for (let i = 1; i < xs.length; i++) {
    const gap = Math.abs(xs[i] - xs[i - 1])
    if (gap > 0 && gap < interval) interval = gap
  }
  if (!Number.isFinite(interval)) return points
  const out: ValuePoint[] = []
  points.forEach((point, i) => {
    out.push(point)
    const [x, y] = point
    const next = points[i + 1]
    const endsRun =
      x != null && y != null && (next === undefined || next[1] == null)
    if (endsRun) out.push([x + interval, y])
  })
  return out
}

const alignValuesToCategoryUnion = (
  q: ResolvedQuery,
  xIdx: number,
  yIdx: number,
  union: string[],
): (number | null)[] => {
  const m = new Map<string, number | null>()
  for (const row of q.dataset)
    m.set(toCategoryLabel(row[xIdx]), toNumberOrNull(row[yIdx]))
  return union.map((lbl) => (m.has(lbl) ? (m.get(lbl) ?? null) : null))
}

const alignRowsToCategoryUnion = (
  rows: Dataset,
  xIdx: number,
  yIdx: number,
  union: string[],
): (number | null)[] => {
  const m = new Map<string, number | null>()
  for (const row of rows)
    m.set(toCategoryLabel(row[xIdx]), toNumberOrNull(row[yIdx]))
  return union.map((lbl) => (m.has(lbl) ? (m.get(lbl) ?? null) : null))
}

const buildCartesianSeries = (
  q: ResolvedQuery,
  ctx: SeriesContext,
): Series[] => {
  const { seriesType, lineExtras, perfExtras, isStacked, isStep } =
    resolveSeriesRenderSpec(q.type)
  const yAxisIndex = q.axis === "right" ? 1 : 0
  const idx = buildColumnIndexMap(q.columns)
  const xIdx = q.xColumn != null ? idx.get(q.xColumn) : undefined
  if (xIdx === undefined) return []
  const stack = isStacked ? `stack-${q.index}` : undefined
  const out: Series[] = []
  const valuePoints = (rows: Dataset, yIdx: number): ValuePoint[] => {
    const points = rows
      .map((row) => [toNumberOrNull(row[xIdx]), toNumberOrNull(row[yIdx])])
      .sort(byX)
    return isStep ? holdStepRunEnds(points) : points
  }

  const partIdx =
    q.partitionByColumn != null ? idx.get(q.partitionByColumn) : undefined

  if (partIdx !== undefined) {
    // Long → wide pivot: each distinct partition value → its own series.
    const groups = new Map<string, Map<string, Dataset>>()
    for (const row of q.dataset) {
      const partVal = toCategoryLabel(row[partIdx])
      let metricMap = groups.get(partVal)
      if (!metricMap) {
        metricMap = new Map()
        groups.set(partVal, metricMap)
      }
      for (const yName of q.yColumns) {
        const yIdx = idx.get(yName)
        if (yIdx === undefined) continue
        let rows = metricMap.get(yName)
        if (!rows) {
          rows = []
          metricMap.set(yName, rows)
        }
        rows.push(row)
      }
    }
    const sortedKeys = [...groups.keys()].sort().slice(0, MAX_PARTITION_SERIES)
    for (const partVal of sortedKeys) {
      const metricMap = groups.get(partVal)
      if (!metricMap) continue
      for (const [yName, rows] of metricMap) {
        const yIdx = idx.get(yName)
        if (yIdx === undefined) continue
        const data =
          ctx.xMode === "time"
            ? rows.map((row) => [row[xIdx], toNumberOrNull(row[yIdx])])
            : ctx.xMode === "value"
              ? valuePoints(rows, yIdx)
              : ctx.categoryUnion
                ? alignRowsToCategoryUnion(rows, xIdx, yIdx, ctx.categoryUnion)
                : rows.map((row) => toNumberOrNull(row[yIdx]))
        out.push({
          name: q.yColumns.length > 1 ? `${partVal} · ${yName}` : partVal,
          type: seriesType,
          yAxisIndex,
          data,
          ...lineExtras,
          ...perfExtras,
          ...(stack ? { stack } : {}),
        })
      }
    }
    return out
  }

  const singleSeriesName = q.yColumns.length === 1 ? q.name : undefined
  for (const name of q.yColumns) {
    const yIdx = idx.get(name)
    if (yIdx === undefined) continue
    const data =
      ctx.xMode === "time"
        ? q.dataset.map((row) => [row[xIdx], toNumberOrNull(row[yIdx])])
        : ctx.xMode === "value"
          ? valuePoints(q.dataset, yIdx)
          : ctx.categoryUnion
            ? alignValuesToCategoryUnion(q, xIdx, yIdx, ctx.categoryUnion)
            : q.dataset.map((row) => toNumberOrNull(row[yIdx]))
    out.push({
      name: singleSeriesName ?? name,
      type: seriesType,
      yAxisIndex,
      data,
      ...lineExtras,
      ...perfExtras,
      ...(stack ? { stack } : {}),
    })
  }
  return out
}

// Two statements often select the same column (bids.size, asks.size). A name
// used by more than one statement gets each statement's label so the legend
// and tooltip tell them apart.
const disambiguateSeriesNames = (
  queries: ResolvedQuery[],
  seriesByQuery: Series[][],
): Series[] => {
  const owners = new Map<string, Set<number>>()
  seriesByQuery.forEach((list, i) => {
    for (const s of list) {
      const name = String(s.name)
      owners.set(name, (owners.get(name) ?? new Set()).add(i))
    }
  })
  return seriesByQuery.flatMap((list, i) =>
    list.map((s) => {
      const name = String(s.name)
      const shared = (owners.get(name)?.size ?? 0) > 1
      return shared ? { ...s, name: `Q${queries[i].index + 1} · ${name}` } : s
    }),
  )
}

const EMPTY_CANDLE: (number | string)[] = ["-", "-", "-", "-"]

const buildCandlestickSeries = (
  q: ResolvedQuery,
  ctx: SeriesContext,
): Series[] => {
  if (!q.ohlc) return []
  const idx = buildColumnIndexMap(q.columns)
  const xIdx = q.xColumn != null ? idx.get(q.xColumn) : undefined
  const oIdx = idx.get(q.ohlc.open)
  const cIdx = idx.get(q.ohlc.close)
  const lIdx = idx.get(q.ohlc.low)
  const hIdx = idx.get(q.ohlc.high)
  if (
    xIdx === undefined ||
    oIdx === undefined ||
    cIdx === undefined ||
    lIdx === undefined ||
    hIdx === undefined
  ) {
    return []
  }
  const candle = (row: Dataset[number]): (number | string)[] => {
    const o = toNumberOrNull(row[oIdx])
    const c = toNumberOrNull(row[cIdx])
    const l = toNumberOrNull(row[lIdx])
    const h = toNumberOrNull(row[hIdx])
    if (o === null || c === null || l === null || h === null)
      return EMPTY_CANDLE
    return [o, c, l, h]
  }
  let data: unknown[]
  if (ctx.xMode === "time") {
    data = q.dataset.map((row) => [row[xIdx], ...candle(row)])
  } else if (ctx.xMode === "value") {
    data = q.dataset.map((row) => [toNumberOrNull(row[xIdx]), ...candle(row)])
  } else if (ctx.categoryUnion) {
    const m = new Map<string, (number | string)[]>()
    for (const row of q.dataset) m.set(toCategoryLabel(row[xIdx]), candle(row))
    data = ctx.categoryUnion.map((lbl) => m.get(lbl) ?? EMPTY_CANDLE)
  } else {
    data = q.dataset.map((row) => candle(row))
  }
  return [
    {
      id: `candle-${q.index}`,
      name: q.name ?? "OHLC",
      type: "candlestick",
      yAxisIndex: q.axis === "right" ? 1 : 0,
      data,
    },
  ]
}

const CANDLE_UP = 1
const CANDLE_DOWN = -1
const CANDLE_FLAT = 0

// A bar under the axis floor is drawn as a stub at the floor and keeps its true
// volume in a fourth slot for the tooltip, so an outlier reads as "below the
// scale" instead of as a missing bucket.
const buildVolumeSeries = (
  q: ResolvedQuery,
  ctx: SeriesContext,
  yAxisIndex: number,
  floor: number,
): Series | null => {
  if (!q.ohlc || q.volume == null) return null
  const idx = buildColumnIndexMap(q.columns)
  const xIdx = q.xColumn != null ? idx.get(q.xColumn) : undefined
  const vIdx = idx.get(q.volume)
  const oIdx = idx.get(q.ohlc.open)
  const cIdx = idx.get(q.ohlc.close)
  if (
    xIdx === undefined ||
    vIdx === undefined ||
    oIdx === undefined ||
    cIdx === undefined
  ) {
    return null
  }
  const direction = (row: Dataset[number]): number => {
    const o = toNumberOrNull(row[oIdx])
    const c = toNumberOrNull(row[cIdx])
    if (o === null || c === null) return CANDLE_FLAT
    return c >= o ? CANDLE_UP : CANDLE_DOWN
  }
  const x = (row: Dataset[number]) =>
    ctx.xMode === "time" ? row[xIdx] : toNumberOrNull(row[xIdx])
  return {
    id: `volume-${q.index}`,
    name: q.volume,
    type: "bar",
    xAxisIndex: 1,
    yAxisIndex,
    barMinHeight: VOLUME_BAR_MIN_HEIGHT,
    itemStyle: { opacity: VOLUME_BAR_OPACITY },
    data: q.dataset.map((row) => {
      const volume = toNumberOrNull(row[vIdx])
      const drawn = volume !== null && volume < floor ? floor : volume
      return [x(row), drawn, direction(row), volume]
    }),
  }
}

type TooltipParam = {
  seriesId?: string
  seriesType?: string
  seriesName?: string
  marker?: string
  axisValueLabel?: string
  value?: unknown
}

const volumeIdFor = (candleId: string | undefined) =>
  candleId?.replace(/^candle-/, "volume-")

const tooltipNumber = (value: unknown): string => {
  if (typeof value === "number")
    return value.toLocaleString("en-US", { maximumFractionDigits: 6 })
  return typeof value === "string" ? value : "-"
}

const tooltipRow = (label: string, value: string, marker = "") =>
  `<div style="display:flex;justify-content:space-between;gap:16px">` +
  `<span>${marker}${label}</span><b>${value}</b></div>`

const linkedPanesTooltip = (raw: unknown): string => {
  const params = (Array.isArray(raw) ? raw : [raw]) as TooltipParam[]
  if (params.length === 0) return ""
  const values = (p: TooltipParam) =>
    Array.isArray(p.value) ? (p.value as unknown[]) : []
  const volumeOf = new Map(
    params
      .filter((p) => p.seriesId?.startsWith("volume-"))
      .map((p) => [p.seriesId, p] as const),
  )
  const folded = new Set(volumeOf.keys())
  const rows = params.flatMap((p) => {
    if (folded.has(p.seriesId)) return []
    if (p.seriesType === "candlestick") {
      const [, open, close, low, high] = values(p)
      const volume = volumeOf.get(volumeIdFor(p.seriesId))
      const title =
        p.seriesName === "OHLC" && volume ? "OHLCV" : (p.seriesName ?? "")
      return [
        `<div style="margin-top:6px">${p.marker ?? ""}${title}</div>` +
          tooltipRow("open", tooltipNumber(open)) +
          tooltipRow("close", tooltipNumber(close)) +
          tooltipRow("lowest", tooltipNumber(low)) +
          tooltipRow("highest", tooltipNumber(high)) +
          (volume
            ? tooltipRow(
                volume.seriesName ?? "volume",
                tooltipNumber(values(volume)[3]),
              )
            : ""),
      ]
    }
    return [
      tooltipRow(p.seriesName ?? "", tooltipNumber(values(p)[1]), p.marker),
    ]
  })
  return `<div>${params[0].axisValueLabel ?? ""}</div>${rows.join("")}`
}

const volumeVisualMap = (seriesIndex: number[], palette: CandlePalette) => ({
  type: "piecewise" as const,
  show: false,
  seriesIndex,
  dimension: 2,
  pieces: [
    { value: CANDLE_UP, color: palette.up },
    { value: CANDLE_DOWN, color: palette.down },
    { value: CANDLE_FLAT, color: palette.neutral },
  ],
})

const buildPieChartOption = (
  q: ResolvedQuery,
  chartText: { fontSize: number },
  legend: object,
): EChartsOption => {
  const idx = buildColumnIndexMap(q.columns)
  const xIdx = q.xColumn != null ? idx.get(q.xColumn) : undefined
  const yIdx = q.yColumns[0] != null ? idx.get(q.yColumns[0]) : undefined
  if (xIdx === undefined || yIdx === undefined)
    return { tooltip: { trigger: "item", textStyle: chartText } }
  const data = q.dataset.map((row) => ({
    name: toCategoryLabel(row[xIdx]),
    value: toNumberOrNull(row[yIdx]) ?? 0,
  }))
  return {
    tooltip: { trigger: "item", textStyle: chartText },
    legend,
    series: [
      {
        name: q.yColumns[0],
        type: "pie",
        radius: ["35%", "70%"],
        avoidLabelOverlap: true,
        label: {
          show: true,
          formatter: "{b}: {d}%",
          fontSize: CHART_FONT_SIZE,
        },
        data,
      },
    ],
  }
}

const buildScatterChartOption = (
  q: ResolvedQuery,
  chartText: { fontSize: number },
  legend: object,
  axisLabel: { fontSize: number },
  axisName: { fontSize: number },
): EChartsOption => {
  const idx = buildColumnIndexMap(q.columns)
  const xIdx = q.xColumn != null ? idx.get(q.xColumn) : undefined
  if (xIdx === undefined)
    return { tooltip: { trigger: "item", textStyle: chartText } }
  const series = q.yColumns
    .map((name) => {
      const yIdx = idx.get(name)
      if (yIdx === undefined) return null
      return {
        name,
        type: "scatter" as const,
        large: true,
        animation: false,
        data: q.dataset.map((row) => [
          toNumberOrNull(row[xIdx]),
          toNumberOrNull(row[yIdx]),
        ]),
      }
    })
    .filter((s): s is NonNullable<typeof s> => s !== null)
  return {
    tooltip: { trigger: "item", textStyle: chartText },
    legend,
    grid: {
      left: 24,
      right: 24,
      top: 40,
      bottom: 48,
      containLabel: true,
    },
    xAxis: {
      type: "value",
      scale: true,
      name: q.xColumn ?? "",
      axisLabel,
      nameTextStyle: axisName,
    },
    yAxis: { type: "value", scale: true, axisLabel, nameTextStyle: axisName },
    series,
  }
}

export const buildEchartsOption = (
  chart: ChartGlobals,
  queries: ResolvedQuery[],
  palette: CandlePalette,
  viewport: ChartViewport,
): EChartsOption => {
  const chartText = { fontSize: CHART_FONT_SIZE }
  const axisLabel = { fontSize: CHART_FONT_SIZE }
  const axisName = { fontSize: CHART_FONT_SIZE }
  const baseLegend = {
    type: "scroll" as const,
    bottom: LEGEND_BOTTOM,
    textStyle: chartText,
  }

  const anchor = queries[0]
  if (!anchor) return { tooltip: { textStyle: chartText } }

  const single = queries.length === 1
  const anchorCol = anchor.columns.find((c) => c.name === anchor.xColumn)
  const anchorRole = anchorCol ? classifyColumn(anchorCol) : "other"

  if (single && anchor.type === "pie")
    return buildPieChartOption(anchor, chartText, baseLegend)
  if (single && anchor.type === "scatter" && anchorRole === "numeric")
    return buildScatterChartOption(
      anchor,
      chartText,
      baseLegend,
      axisLabel,
      axisName,
    )

  const xMode: XMode =
    anchorRole === "temporal"
      ? "time"
      : anchorRole === "numeric"
        ? "value"
        : "category"

  // A single, non-partitioned query renders positionally: one axis slot and one
  // value per row, so duplicate categorical x values are preserved. The deduped
  // category union + per-label alignment is only needed to overlay several
  // series (multiple queries, or a partition pivot) onto one shared axis — there
  // the Map keying necessarily picks one row per label.
  const positionalCategory =
    xMode === "category" && single && anchor.partitionByColumn == null

  let categoryUnion: string[] | null = null
  let categoryAxisData: string[] = []
  if (positionalCategory) {
    const xIdx = anchor.columns.findIndex((c) => c.name === anchor.xColumn)
    categoryAxisData =
      xIdx < 0 ? [] : anchor.dataset.map((row) => toCategoryLabel(row[xIdx]))
  } else if (xMode === "category") {
    const seen = new Set<string>()
    const union: string[] = []
    for (const q of queries) {
      const xIdx = q.columns.findIndex((c) => c.name === q.xColumn)
      if (xIdx < 0) continue
      for (const v of extractColumnValues(q.dataset, xIdx)) {
        const lbl = toCategoryLabel(v)
        if (seen.has(lbl)) continue
        seen.add(lbl)
        union.push(lbl)
      }
    }
    categoryUnion = union
    categoryAxisData = union
  }

  const ctx: SeriesContext = { xMode, categoryUnion }
  const hasCandle = queries.some((q) => q.type === "candlestick")
  const hasBar = queries.some(
    (q) => q.type === "bar" || q.type === "stackedBar",
  )

  const series = disambiguateSeriesNames(
    queries,
    queries.map((q) =>
      q.type === "candlestick"
        ? buildCandlestickSeries(q, ctx)
        : q.type === "pie"
          ? [] // pie can't share an axis
          : buildCartesianSeries(q, ctx),
    ),
  )

  const overlaidByBars =
    series.some((s) => s.type === "bar") && series.some((s) => s.type !== "bar")
  if (overlaidByBars) {
    for (const s of series) {
      if (s.type === "bar") {
        s.itemStyle = {
          ...(s.itemStyle as object),
          opacity: BAR_OVERLAY_OPACITY,
        }
      } else {
        // Default series z is 2; bump non-bar series above the bars.
        s.z = 3
      }
    }
  }

  const volumeQueries = queries.filter(
    (q) => q.type === "candlestick" && q.volume != null,
  )
  const hasVolumePane = volumeQueries.length > 0 && xMode !== "category"

  const hasRight = queries.some((q) => q.axis === "right")
  const rightQueries = queries.filter((q) => q.axis === "right")
  const rightTitle =
    chart.rightAxis?.name ??
    (rightQueries.length === 1
      ? (rightQueries[0].name ?? rightQueries[0].yColumns[0] ?? "")
      : "")

  const maxRows = queries.reduce((m, q) => Math.max(m, q.dataset.length), 0)
  const hasZoom = maxRows > DATAZOOM_THRESHOLD
  const sliderZoom = {
    type: "slider" as const,
    height: SLIDER_HEIGHT,
    bottom: SLIDER_BOTTOM,
    textStyle: chartText,
  }

  const rightPadding = 36
  const gridBottom = hasZoom ? GRID_BOTTOM_WITH_ZOOM : GRID_BOTTOM_NO_ZOOM

  // Two stacked panes cannot share the automatic label fitting, so both take
  // the same fixed margins and line up exactly.
  const volumePaneBottom = gridBottom + PANE_AXIS_LABEL_SPACE
  // The volume pane takes a fifth of the plot area, the candles the rest. The
  // height arrives from the renderer; until it does, the pane is at its floor.
  const plotHeight = viewport.height - 40 - volumePaneBottom - VOLUME_PANE_GAP
  const volumePaneHeight = Math.max(
    VOLUME_PANE_MIN_HEIGHT,
    Math.round(plotHeight * VOLUME_PANE_SHARE),
  )
  const grid: EChartsOption["grid"] = hasVolumePane
    ? [
        {
          left: PANE_LEFT,
          right: PANE_RIGHT,
          top: 40,
          bottom: volumePaneBottom + volumePaneHeight + VOLUME_PANE_GAP,
        },
        {
          left: PANE_LEFT,
          right: PANE_RIGHT,
          bottom: volumePaneBottom,
          height: volumePaneHeight,
        },
      ]
    : {
        left: 24,
        right: rightPadding,
        top: 40,
        bottom: gridBottom,
        containLabel: true,
      }

  // A y-axis title sits centred on the axis line by default, so a long one
  // runs off the panel. Anchor it to the axis and let it grow over the plot.
  const leftAxis = {
    type: "value" as const,
    scale: true,
    axisLabel,
    nameTextStyle: { ...axisName, align: "left" as const },
    ...(chart.leftAxis?.name ? { name: chart.leftAxis.name } : {}),
    ...pinnedBounds(chart.leftAxis),
  }
  const priceAxes = hasRight
    ? [
        leftAxis,
        {
          type: "value" as const,
          scale: true,
          position: "right" as const,
          name: rightTitle,
          nameTextStyle: { ...axisName, align: "right" as const },
          axisLabel,
          splitLine: { show: false },
          ...pinnedBounds(chart.rightAxis),
        },
      ]
    : [leftAxis]
  const volumeAxisIndex = priceAxes.length
  const volumeBounds = volumeAxisBounds(volumeQueries)
  const volumeAxis = {
    type: "value" as const,
    gridIndex: 1,
    position: "right" as const,
    ...volumeBounds,
    splitNumber: 2,
    axisLabel: {
      ...axisLabel,
      formatter: compactNumber,
      showMinLabel: false,
      showMaxLabel: false,
    },
    splitLine: { show: false },
  }
  const yAxis: EChartsOption["yAxis"] = hasVolumePane
    ? [...priceAxes, volumeAxis]
    : hasRight
      ? priceAxes
      : leftAxis

  const xAxisName = {
    name: chart.xColumn ?? "",
    nameLocation: "middle" as const,
    nameGap: X_AXIS_NAME_GAP,
    axisLabel,
    nameTextStyle: axisName,
  }
  const xAxis: EChartsOption["xAxis"] =
    xMode === "time"
      ? {
          type: "time",
          ...xAxisName,
          // Extend the time axis 5% on each side so candle bodies sit inside the
          // plot (time axis is boundaryGap:false by default).
          ...(hasCandle
            ? {
                min: (v: { min: number; max: number }) =>
                  v.min - (v.max - v.min) * 0.05,
                max: (v: { min: number; max: number }) =>
                  v.max + (v.max - v.min) * 0.05,
              }
            : {}),
        }
      : xMode === "value"
        ? {
            type: "value",
            scale: true,
            ...xAxisName,
            ...(fitsValueAxisToData(queries)
              ? {
                  min: "dataMin",
                  max: "dataMax",
                  axisLabel: {
                    ...axisLabel,
                    showMinLabel: false,
                    showMaxLabel: false,
                  },
                }
              : {}),
          }
        : {
            type: "category",
            data: categoryAxisData,
            ...xAxisName,
            boundaryGap: hasBar || hasCandle,
          }

  const tooltip: EChartsOption["tooltip"] = {
    trigger: "axis",
    textStyle: chartText,
    ...(hasCandle ? { axisPointer: { type: "cross" } } : {}),
  }

  // Axis labels and tooltips print in the browser's zone, the zone typed
  // ranges are read in. The result grid keeps the server's UTC strings.
  if (!hasVolumePane) {
    return {
      useUTC: false,
      tooltip,
      legend: baseLegend,
      grid,
      xAxis,
      yAxis,
      dataZoom: hasZoom ? [{ type: "inside" }, sliderZoom] : undefined,
      series: series as EChartsOption["series"],
    }
  }

  const volumeSeries = volumeQueries
    .map((q) =>
      buildVolumeSeries(q, ctx, volumeAxisIndex, volumeBounds?.min ?? 0),
    )
    .filter((s): s is Series => s !== null)
  const volumeSeriesIndex = volumeSeries.map((_, i) => series.length + i)
  const bothAxes = { xAxisIndex: [0, 1] }
  // Linked panes would each print the hovered time under their own axis.
  const noPointerLabel = { label: { show: false } }
  return {
    useUTC: false,
    tooltip: { ...tooltip, formatter: linkedPanesTooltip },
    legend: baseLegend,
    grid,
    xAxis: [
      {
        ...xAxis,
        name: "",
        axisLabel: { show: false },
        axisLine: { show: false },
        axisTick: { show: false },
        axisPointer: noPointerLabel,
      },
      { ...xAxis, gridIndex: 1, axisPointer: noPointerLabel },
    ],
    yAxis,
    axisPointer: { link: [{ xAxisIndex: "all" }] },
    visualMap: volumeVisualMap(volumeSeriesIndex, palette),
    dataZoom: hasZoom
      ? [
          { type: "inside", ...bothAxes },
          { ...sliderZoom, ...bothAxes },
        ]
      : undefined,
    series: [...series, ...volumeSeries] as EChartsOption["series"],
  }
}
