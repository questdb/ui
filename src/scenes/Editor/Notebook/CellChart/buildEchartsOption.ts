import type { CustomSeriesRenderItem, EChartsOption } from "echarts"
import type { ChartZoomDensity } from "./chartDensity"
import type { ColumnDefinition } from "../../../../utils/questdb/types"
import type {
  ChartConfig,
  ChartType,
  HeatmapColorScale,
  ReferenceLine,
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
  partitionByColumn?: string
  axis: SeriesAxis
  name?: string
  colorScale?: HeatmapColorScale
}

export type ChartGlobals = {
  xColumn: string | null
  rightAxis?: ChartConfig["rightAxis"]
  referenceLines?: ReferenceLine[]
}

type Series = Record<string, unknown>

type XMode = "time" | "value" | "category"

type SeriesContext = {
  xMode: XMode
  categoryUnion: string[] | null // set only when overlaying series onto a shared category axis; null for a single positional query
}

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
  for (const row of rows)
    m.set(toCategoryLabel(row[xIdx]), toNumberOrNull(row[yIdx]))
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

const escapeHtml = (text: string): string =>
  text.replace(
    /[&<>"']/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        ch
      ] ?? ch,
  )

// "2026-11-18T12:00:00.000000Z" → "2026-11-18 12:00", and a midnight to
// its date alone: a heatmap's time slots are labels, not a time axis.
const compactTimestamp = (label: string): string => {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(:\d{2})?(\.\d+)?Z?$/.exec(label)
  if (!m) return label
  const [, date, hhmm, seconds] = m
  if (seconds && seconds !== ":00") return `${date} ${hhmm}${seconds}`
  return hhmm === "00:00" ? date : `${date} ${hhmm}`
}

const formatScaleValue = (value: number): string =>
  Number.isInteger(value) ? String(value) : String(Number(value.toPrecision(4)))

const scaleLabels = (min: number, max: number): string[] => {
  const low = formatScaleValue(min)
  const high = formatScaleValue(max)
  return min !== max && low === high ? [String(max), String(min)] : [high, low]
}

type HeatmapReading = { y: number; reading: Dataset[number][number] }

const longReading = (value: HeatmapReading["reading"]): bigint | null => {
  if (typeof value === "bigint") return value
  if (typeof value === "string" && /^[+-]?\d+$/.test(value))
    return BigInt(value)
  if (typeof value === "number" && Number.isInteger(value)) return BigInt(value)
  return null
}

const longHeatmapScale = (cells: HeatmapReading[], perRow: boolean) => {
  const values = cells.map(({ reading }) => longReading(reading))
  const extents = new Map<number, { min: bigint; max: bigint }>()
  cells.forEach(({ y }, i) => {
    const value = values[i]
    if (value === null) return
    const key = perRow ? y : 0
    const extent = extents.get(key)
    if (!extent) extents.set(key, { min: value, max: value })
    else {
      if (value < extent.min) extent.min = value
      if (value > extent.max) extent.max = value
    }
  })
  const shades = cells.map(({ y }, i) => {
    const value = values[i]
    const extent = extents.get(perRow ? y : 0)
    if (value === null || !extent) return "-"
    const { min, max } = extent
    if (min === max) return perRow ? 1 : 0.5
    // Subtract before converting: adjacent LONGs can have the same double.
    return Number(value - min) / Number(max - min)
  })
  const extent = extents.get(0)
  return {
    shades,
    min: 0,
    max: 1,
    labels: extent ? [String(extent.max), String(extent.min)] : ["1", "0"],
  }
}

const numericHeatmapScale = (
  cells: HeatmapReading[],
  perRow: boolean,
  rowCount: number,
) => {
  const values = cells.map(({ reading }) => toNumberOrNull(reading))
  const emptyExtent = () => ({ min: Infinity, max: -Infinity })
  const globalExtent = emptyExtent()
  const rowExtents = perRow ? Array.from({ length: rowCount }, emptyExtent) : []
  cells.forEach(({ y }, i) => {
    const value = values[i]
    if (value === null) return
    const extent = perRow ? rowExtents[y] : globalExtent
    extent.min = Math.min(extent.min, value)
    extent.max = Math.max(extent.max, value)
  })
  const shades = cells.map(({ y }, i) => {
    const value = values[i]
    if (value === null) return "-"
    if (!perRow) return value
    const { min, max } = rowExtents[y]
    return max === min ? 1 : (value - min) / (max - min)
  })
  const { min, max } =
    perRow || globalExtent.min === Infinity ? { min: 0, max: 1 } : globalExtent
  return { shades, min, max, labels: scaleLabels(min, max) }
}

// A grid of cells: x along the bottom, one row per value of the partition
// column, and each cell colored by its value.
const buildHeatmapOption = (
  q: ResolvedQuery,
  chartText: { fontSize: number },
  axisLabel: { fontSize: number },
  axisName: { fontSize: number },
  xRole: string,
): EChartsOption => {
  const idx = buildColumnIndexMap(q.columns)
  const xIdx = q.xColumn != null ? idx.get(q.xColumn) : undefined
  const rowIdx =
    q.partitionByColumn != null ? idx.get(q.partitionByColumn) : undefined
  const valueIdx = q.yColumns[0] != null ? idx.get(q.yColumns[0]) : undefined
  if (xIdx === undefined || rowIdx === undefined || valueIdx === undefined)
    return { tooltip: { trigger: "item", textStyle: chartText } }

  // Time and numbers run in order along x, whatever the query's ORDER BY: a
  // query sorted by row first lists each row's times in turn. Categories
  // keep the order they came in.
  const xValues = new Map<string, unknown>()
  const rowSet = new Set<string>()
  for (const row of q.dataset) {
    const x = toCategoryLabel(row[xIdx])
    if (!xValues.has(x)) xValues.set(x, row[xIdx])
    rowSet.add(toCategoryLabel(row[rowIdx]))
  }
  const xLabels = [...xValues.keys()]
  if (xRole === "temporal") {
    const time = (label: string) => {
      const ms = Date.parse(label)
      return Number.isNaN(ms) ? Number(xValues.get(label)) : ms
    }
    xLabels.sort((a, b) => time(a) - time(b) || a.localeCompare(b))
  } else if (xRole === "numeric") {
    xLabels.sort((a, b) => Number(xValues.get(a)) - Number(xValues.get(b)))
  }
  const xSlot = new Map(xLabels.map((label, i) => [label, i]))
  const rowLabels = [...rowSet].sort()
  // Slots of a single day show their time alone.
  const timeOf = (label: string) =>
    /T(\d{2}:\d{2}(:\d{2}(?<!:00))?)/.exec(label)?.[1] ?? label
  const sameDay =
    xRole === "temporal" &&
    new Set(xLabels.map((label) => label.slice(0, 10))).size === 1 &&
    xLabels.every((label) => label.includes("T"))
  const formatX =
    xRole !== "temporal"
      ? (label: string) => label
      : sameDay
        ? timeOf
        : compactTimestamp
  const rowSlot = new Map(rowLabels.map((label, i) => [label, i]))

  // Each cell: x slot, row, the value it is colored by, and its own value.
  // On a scale per row, a cell is colored by where it falls in its row.
  const cells = q.dataset.map((row) => ({
    x: xSlot.get(toCategoryLabel(row[xIdx])) ?? 0,
    y: rowSlot.get(toCategoryLabel(row[rowIdx])) ?? 0,
    reading: row[valueIdx],
  }))
  const perRow = q.colorScale === "row"
  const { shades, min, max, labels } =
    q.columns[valueIdx].type?.toUpperCase() === "LONG"
      ? longHeatmapScale(cells, perRow)
      : numericHeatmapScale(cells, perRow, rowLabels.length)
  const data = cells.map(({ x, y, reading }, i) => [
    x,
    y,
    shades[i],
    typeof reading === "bigint" ? String(reading) : (reading ?? "-"),
  ])

  return {
    useUTC: true,
    tooltip: {
      trigger: "item",
      textStyle: chartText,
      formatter: (params: unknown) => {
        const [x, y, , value] = (
          params as { value: [number, number, unknown, unknown] }
        ).value
        return `${escapeHtml(xLabels[x] ?? "")}<br/>${escapeHtml(
          rowLabels[y] ?? "",
        )}: <b>${escapeHtml(String(value))}</b>`
      },
    },
    grid: {
      left: 24,
      right: 24,
      top: 24,
      bottom: GRID_BOTTOM_NO_ZOOM,
      containLabel: true,
    },
    xAxis: {
      type: "category",
      data: xLabels,
      name: q.xColumn ?? "",
      nameLocation: "middle",
      nameGap: X_AXIS_NAME_GAP,
      nameTextStyle: axisName,
      axisLabel: { ...axisLabel, formatter: formatX },
      splitArea: { show: false },
    },
    // Rows read top-down, in order, like a table.
    yAxis: {
      type: "category",
      data: rowLabels,
      inverse: true,
      axisLabel,
      nameTextStyle: axisName,
      splitArea: { show: false },
    },
    visualMap: {
      type: "continuous",
      min,
      max,
      dimension: 2,
      calculable: false,
      orient: "horizontal",
      left: "center",
      bottom: LEGEND_BOTTOM,
      itemWidth: 10,
      itemHeight: 140,
      text: perRow ? ["Row high", "Row low"] : labels,
      textGap: 8,
      textStyle: chartText,
    },
    // Drawn cell by cell, like Grafana's state timeline: a row's cells run
    // into each other, and rows keep a gap between them.
    series: [
      {
        name: q.yColumns[0],
        type: "custom",
        renderItem: renderHeatmapCell,
        clip: true,
        encode: { x: 0, y: 1, tooltip: 3 },
        data,
      },
    ],
  }
}

// The share of a row its cells fill; the rest is the gap between rows.
export const HEATMAP_ROW_FILL = 0.8

// A cell spans its whole slot along x, half a pixel more on each side so
// neighbors leave no seam, and HEATMAP_ROW_FILL of its row. A cell without a
// value is left empty.
const renderHeatmapCell: CustomSeriesRenderItem = (_params, api) => {
  if (!Number.isFinite(api.value(2))) return null
  const [cx, cy] = api.coord([api.value(0), api.value(1)])
  const [width, height] = api.size?.([1, 1]) as number[]
  const rowHeight = height * HEATMAP_ROW_FILL
  return {
    type: "rect",
    shape: {
      x: cx - width / 2 - 0.5,
      y: cy - rowHeight / 2,
      width: width + 1,
      height: rowHeight,
    },
    style: { fill: api.visual("color") as string },
  }
}

// Reference lines belong to the axes, not a selectable legend entry.
const referenceLineSeries = (series: Series[], lines: ReferenceLine[]) => {
  const plottedAxes = new Set(series.map((s) => s.yAxisIndex ?? 0))
  const markers = new Map<number, Series>()
  for (const line of lines) {
    const wanted = line.axis === "right" ? 1 : 0
    const axis = plottedAxes.has(wanted) ? wanted : 1 - wanted
    if (!plottedAxes.has(axis)) continue
    const target = markers.get(axis) ?? {
      id: `reference-lines-${axis}`,
      type: "line",
      yAxisIndex: axis,
      data: [],
      silent: true,
      animation: false,
      tooltip: { show: false },
    }
    const markLine = (target.markLine as { data: unknown[] } | undefined) ?? {
      precision: -1,
      silent: true,
      symbol: "none",
      animation: false,
      lineStyle: { type: "dashed", width: 1 },
      label: { position: "insideEndTop" },
      data: [] as unknown[],
    }
    markLine.data.push({
      yAxis: line.value,
      label: { formatter: line.label ?? String(line.value) },
    })
    target.markLine = markLine
    markers.set(axis, target)
  }
  return [...markers.values()]
}

// An axis that scales to its data keeps its reference lines in view. A bound
// of null leaves the axis to scale itself; ECharts' types do not admit it.
type AxisBound = (extent: { min: number; max: number }) => number
const axisBoundsWith = (
  values: number[],
): { min?: AxisBound; max?: AxisBound } => {
  if (values.length === 0) return { min: undefined, max: undefined }
  const lowest = Math.min(...values)
  const highest = Math.max(...values)
  return {
    min: ((v) => (lowest < v.min ? lowest : null)) as AxisBound,
    max: ((v) => (highest > v.max ? highest : null)) as AxisBound,
  }
}

const buildScatterChartOption = (
  q: ResolvedQuery,
  referenceLines: ReferenceLine[],
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
  const markers = referenceLineSeries(series, referenceLines)
  return {
    tooltip: { trigger: "item", textStyle: chartText },
    legend: { ...legend, data: [...new Set(series.map((s) => s.name))] },
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
    yAxis: {
      type: "value",
      scale: true,
      axisLabel,
      nameTextStyle: axisName,
      ...axisBoundsWith(
        series.length ? referenceLines.map((line) => line.value) : [],
      ),
    },
    series: [...series, ...markers] as EChartsOption["series"],
  }
}

export const buildEchartsOption = (
  chart: ChartGlobals,
  queries: ResolvedQuery[],
): EChartsOption => {
  const chartText = { fontSize: CHART_FONT_SIZE }
  const axisLabel = { fontSize: CHART_FONT_SIZE, hideOverlap: true }
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
  if (single && anchor.type === "heatmap")
    return buildHeatmapOption(
      anchor,
      chartText,
      axisLabel,
      axisName,
      anchorRole,
    )
  if (single && anchor.type === "scatter" && anchorRole === "numeric")
    return buildScatterChartOption(
      anchor,
      chart.referenceLines ?? [],
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
    else if (q.type === "pie" || q.type === "heatmap")
      continue // pie and heatmap can't share an axis
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
  const referenceLines = chart.referenceLines ?? []
  const markers = referenceLineSeries(series, referenceLines)
  // Where each line landed: on the right axis only when a right series took it.
  const linesOn = (axisIndex: number) =>
    markers
      .filter((s) => (s.yAxisIndex ?? 0) === axisIndex)
      .flatMap(
        (s) =>
          (s.markLine as { data: { yAxis: number }[] } | undefined)?.data ?? [],
      )
      .map((d) => d.yAxis)
  const rightQueries = queries.filter((q) => q.axis === "right")
  const rightTitle =
    chart.rightAxis?.name ??
    (rightQueries.length === 1
      ? (rightQueries[0].name ?? rightQueries[0].yColumns[0] ?? "")
      : "")

  const rightPadding = 36

  const grid: EChartsOption["grid"] = {
    left: 24,
    right: rightPadding,
    top: 40,
    bottom: GRID_BOTTOM_NO_ZOOM,
    containLabel: true,
  }

  const leftAxis = {
    type: "value" as const,
    scale: true,
    axisLabel,
    nameTextStyle: axisName,
    ...axisBoundsWith(linesOn(0)),
  }
  const rightBounds = axisBoundsWith(linesOn(1))
  // Grid lines follow the left axis, so the two axes' lines do not clash.
  // With every series on the right, the left axis is empty and the right one
  // draws them; otherwise the chart would have none.
  const hasLeft = queries.some((q) => q.axis !== "right")
  const yAxis: EChartsOption["yAxis"] = hasRight
    ? [
        { ...leftAxis, show: hasLeft },
        {
          type: "value",
          scale: true,
          position: "right",
          name: rightTitle,
          nameTextStyle: axisName,
          axisLabel,
          splitLine: { show: !hasLeft },
          // Keep both keys even when unset: chart updates merge into the prior
          // option, and an omitted key would keep a cleared bound on screen.
          min: chart.rightAxis?.min ?? rightBounds.min,
          max: chart.rightAxis?.max ?? rightBounds.max,
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
    // The server sends UTC and every result grid prints it verbatim, so the
    // axis and tooltip must not re-render those instants in the browser's zone.
    useUTC: true,
    tooltip,
    legend: {
      ...baseLegend,
      data: [...new Set(series.map((s) => String(s.name)))],
    },
    grid,
    xAxis,
    yAxis,
    series: [...series, ...markers] as EChartsOption["series"],
  }
}

// Every cartesian chart embeds both zoom components, and density only toggles
// their visibility — never the option's structure, which would remount the
// chart through its structural key. Wheel zoom arms while marks are merely
// tight (it costs no plot space); the slider costs plot height, so it waits
// until marks fall under the readable floor. The renderer measures the density
// from its own width.
export const withZoomDensity = (
  option: EChartsOption,
  density: ChartZoomDensity,
): EChartsOption => {
  if (option.xAxis == null) return option
  return {
    ...option,
    grid: {
      ...(option.grid as object),
      bottom: density.slider ? GRID_BOTTOM_WITH_ZOOM : GRID_BOTTOM_NO_ZOOM,
    },
    dataZoom: [
      { type: "inside", disabled: !density.wheel },
      {
        type: "slider",
        show: density.slider,
        height: SLIDER_HEIGHT,
        bottom: SLIDER_BOTTOM,
        textStyle: { fontSize: CHART_FONT_SIZE },
      },
    ],
  }
}
