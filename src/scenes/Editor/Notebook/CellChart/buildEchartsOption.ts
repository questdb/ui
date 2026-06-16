import type { EChartsOption } from "echarts"
import type { ColumnDefinition } from "../../../../utils/questdb/types"
import type { ChartConfig, ChartType, SeriesAxis } from "./chartTypes"
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
  partitionByColumn?: string
  axis: SeriesAxis
  name?: string
}

export type ChartGlobals = {
  xColumn: string | null
  name?: string
  rightAxis?: ChartConfig["rightAxis"]
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

const buildColumnIndexMap = (
  columns: ColumnDefinition[],
): Map<string, number> => {
  const m = new Map<string, number>()
  columns.forEach((c, i) => m.set(c.name, i))
  return m
}

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
  if (type === "area") lineExtras.smooth = true
  if (isStep) lineExtras.step = "end"
  // Scatter/bar use `large` for big point/bar sets; lines downsample with LTTB.
  const perfExtras: { sampling?: "lttb"; large?: boolean } = isLineFamily
    ? { sampling: "lttb" }
    : { large: true }
  return { seriesType, lineExtras, perfExtras, isStacked }
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
  for (const row of rows) {
    const lbl = toCategoryLabel(row[xIdx])
    if (!m.has(lbl)) m.set(lbl, toNumberOrNull(row[yIdx]))
  }
  return union.map((lbl) => (m.has(lbl) ? (m.get(lbl) ?? null) : null))
}

const buildCartesianSeries = (
  q: ResolvedQuery,
  ctx: SeriesContext,
): Series[] => {
  const { seriesType, lineExtras, perfExtras, isStacked } =
    resolveSeriesRenderSpec(q.type)
  const yAxisIndex = q.axis === "right" ? 1 : 0
  const idx = buildColumnIndexMap(q.columns)
  const xIdx = q.xColumn != null ? idx.get(q.xColumn) : undefined
  if (xIdx === undefined) return []
  const stack = isStacked ? `stack-${q.index}` : undefined
  const out: Series[] = []

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
              ? rows.map((row) => [
                  toNumberOrNull(row[xIdx]),
                  toNumberOrNull(row[yIdx]),
                ])
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

  for (const name of q.yColumns) {
    const yIdx = idx.get(name)
    if (yIdx === undefined) continue
    const data =
      ctx.xMode === "time"
        ? q.dataset.map((row) => [row[xIdx], toNumberOrNull(row[yIdx])])
        : ctx.xMode === "value"
          ? q.dataset.map((row) => [
              toNumberOrNull(row[xIdx]),
              toNumberOrNull(row[yIdx]),
            ])
          : ctx.categoryUnion
            ? alignValuesToCategoryUnion(q, xIdx, yIdx, ctx.categoryUnion)
            : q.dataset.map((row) => toNumberOrNull(row[yIdx]))
    out.push({
      name,
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
      name: q.name ?? "OHLC",
      type: "candlestick",
      yAxisIndex: q.axis === "right" ? 1 : 0,
      data,
    },
  ]
}

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

  const series: Series[] = []
  for (const q of queries) {
    if (q.type === "candlestick") series.push(...buildCandlestickSeries(q, ctx))
    else if (q.type === "pie")
      continue // pie can't share an axis
    else series.push(...buildCartesianSeries(q, ctx)) // line/area/bar/stackedBar/scatter
  }

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

  const grid: EChartsOption["grid"] = {
    left: 24,
    right: rightPadding,
    top: 40,
    bottom: hasZoom ? GRID_BOTTOM_WITH_ZOOM : GRID_BOTTOM_NO_ZOOM,
    containLabel: true,
  }

  const leftAxis = {
    type: "value" as const,
    scale: true,
    axisLabel,
    nameTextStyle: axisName,
  }
  const yAxis: EChartsOption["yAxis"] = hasRight
    ? [
        leftAxis,
        {
          type: "value",
          scale: true,
          position: "right",
          name: rightTitle,
          nameTextStyle: axisName,
          axisLabel,
          splitLine: { show: false },
          ...(chart.rightAxis?.min != null ? { min: chart.rightAxis.min } : {}),
          ...(chart.rightAxis?.max != null ? { max: chart.rightAxis.max } : {}),
        },
      ]
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
        ? { type: "value", scale: true, ...xAxisName }
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

  return {
    tooltip,
    legend: baseLegend,
    grid,
    xAxis,
    yAxis,
    dataZoom: hasZoom ? [{ type: "inside" }, sliderZoom] : undefined,
    series: series as EChartsOption["series"],
  }
}
