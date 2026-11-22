import type { EChartsOption } from "echarts"
import type { ChartZoomDensity } from "./chartDensity"
import type { ColumnDefinition } from "../../../../utils/questdb/types"
import type {
  ChartConfig,
  ChartType,
  EventColumns,
  PieShape,
  ScatterColumns,
  SeriesAxis,
} from "./chartTypes"
import { MAX_PARTITION_SERIES, classifyColumn } from "./inferChartConfig"
import type { ColorShape } from "../../../../types/styled"
import { withAlpha } from "../../../../theme"
import { escapeHtml } from "../../../../utils/escapeHtml"
import {
  formatValue,
  isTone,
  thresholdBands,
  toneColor,
  type ColumnFormat,
  type ColumnFormats,
  type Tone,
} from "../../../../utils/formats/columnFormat"

type Dataset = (boolean | string | number | null)[][]

export type ResolvedQuery = {
  index: number
  columns: ColumnDefinition[]
  dataset: Dataset
  xColumn: string | null // for value extraction
  type: ChartType
  yColumns: string[]
  ohlc?: { open: string; high: string; low: string; close: string }
  // The columns of a heatmap, band, range bar or boxplot, resolved.
  roles?: Record<string, string>
  percentStack?: boolean
  pieShape?: PieShape
  scatter?: ScatterColumns
  partitionByColumn?: string
  axis: SeriesAxis
  name?: string
}

export type ResolvedEvents = {
  index: number
  columns: ColumnDefinition[]
  dataset: Dataset
  columnsRole: EventColumns
}

export type ChartGlobals = {
  xColumn: string | null
  rightAxis?: ChartConfig["rightAxis"]
  horizontal?: boolean
  thresholds?: ChartConfig["thresholds"]
  events?: ResolvedEvents[]
}

// Theme colours and column formats; without them the chart draws with the
// theme defaults and unformatted values.
export type ChartContext = {
  colors?: ColorShape
  formats?: ColumnFormats
  clickColumn?: string
  clickEnabled?: boolean
  preciseTimePointer?: boolean
}

type Series = Record<string, unknown>

// The y column a series draws, for its format; removed before drawing.
const Y_COLUMN = "__yColumn"

type XMode = "time" | "value" | "category"

type SeriesContext = {
  xMode: XMode
  clickColumn?: string
  clickEnabled?: boolean
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

const resolveSeriesRenderSpec = (type: ChartType, clickEnabled: boolean) => {
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
    // ECharts uses a temporary point for hover. It must have a shape to
    // deliver the clicked row, even though regular point symbols stay hidden.
    lineExtras.symbol = clickEnabled ? "circle" : "none"
    lineExtras.showSymbol = false
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

type ClickPoint = { value: unknown; columns: Record<string, unknown> }

const isClickPoint = (point: unknown): point is ClickPoint =>
  point !== null &&
  typeof point === "object" &&
  "columns" in point &&
  "value" in point

const pointValue = (point: unknown): unknown =>
  isClickPoint(point) ? point.value : point

const alignPointsToCategoryUnion = (
  rows: Dataset,
  xIdx: number,
  union: string[],
  toPoint: (row: Dataset[number]) => unknown,
): unknown[] => {
  const byCategory = new Map<string, unknown>()
  for (const row of rows)
    byCategory.set(toCategoryLabel(row[xIdx]), toPoint(row))
  return union.map((label) => byCategory.get(label) ?? null)
}

// Marks a series whose values were turned into shares of 100.
const PERCENT = "__percent"
// Marks a scatter series coloured by a column: [min, max] of its values.
const COLOR_SCALE = "__colorScale"
// Marks a scatter series sized or coloured by columns: what each value is.
const POINT_COLUMNS = "__pointColumns"

type PointColumns = { x: string; y: string; size?: string; color?: string }

// A value in its format; a number whose format sets no rounding reads with
// at most two decimals, not with every digit of a double.
const readableValue = (value: unknown, format: ColumnFormat | undefined) => {
  const rounds =
    format?.decimals !== undefined ||
    format?.compact === true ||
    (format?.kind !== undefined && format.kind !== "number")
  return formatValue(
    !rounds && typeof value === "number"
      ? Math.round(value * 100) / 100
      : value,
    format,
  )
}

// A point's tooltip: each of its values in its own column's format.
const pointTooltip =
  (columns: PointColumns, formats: ColumnFormats) => (params: unknown) => {
    const { marker, seriesName, value } = params as {
      marker?: string
      seriesName?: string
      value: unknown[]
    }
    const lines = (
      [
        [columns.x, value[0]],
        [columns.y, value[1]],
        [columns.size, value[2]],
        [columns.color, value[3]],
      ] as const
    )
      .filter(([column]) => column !== undefined)
      .map(
        ([column, v]) =>
          `${escapeHtml(column ?? "")} <b>${escapeHtml(readableValue(v, formats[column ?? ""]))}</b>`,
      )
    return `${marker ?? ""}${escapeHtml(seriesName ?? "")}<br/>${lines.join("<br/>")}`
  }

const isPercentStack = (q: Pick<ResolvedQuery, "type" | "percentStack">) =>
  q.percentStack === true &&
  (q.type === "area" || q.type === "stepArea" || q.type === "stackedBar")

const numericExtent = (values: (number | null)[]): [number, number] | null => {
  const finite = values.filter((v): v is number => v !== null)
  return finite.length ? [Math.min(...finite), Math.max(...finite)] : null
}

const MIN_POINT = 6
const MAX_POINT = 32

// Points sized and coloured by columns: [x, y, size, colour] per row.
const scatterEncoding = (q: ResolvedQuery) => {
  if (q.type !== "scatter" || !q.scatter) return null
  const idx = buildColumnIndexMap(q.columns)
  const sizeIdx = q.scatter.size ? idx.get(q.scatter.size) : undefined
  const colorIdx = q.scatter.color ? idx.get(q.scatter.color) : undefined
  if (sizeIdx === undefined && colorIdx === undefined) return null
  const valuesOf = (i: number | undefined) =>
    i === undefined ? [] : q.dataset.map((row) => toNumberOrNull(row[i]))
  const sizes = numericExtent(valuesOf(sizeIdx))
  const colors = numericExtent(valuesOf(colorIdx))
  // Area grows with the value, so the radius with its square root.
  const symbolSize = (value: unknown) => {
    const v = Array.isArray(value) ? toNumberOrNull(value[2]) : null
    if (v === null || !sizes) return MIN_POINT
    const [lo, hi] = sizes
    const t = hi > lo ? Math.sqrt((v - lo) / (hi - lo)) : 0.5
    return MIN_POINT + t * (MAX_POINT - MIN_POINT)
  }
  return {
    tuple: (x: unknown, row: Dataset[number], yIdx: number) => [
      x,
      toNumberOrNull(row[yIdx]),
      sizeIdx === undefined ? null : toNumberOrNull(row[sizeIdx]),
      colorIdx === undefined ? null : toNumberOrNull(row[colorIdx]),
    ],
    extras: (yName: string): Series => ({
      dimensions: [
        q.xColumn ?? "x",
        yName,
        q.scatter?.size ?? "size",
        q.scatter?.color ?? "colour",
      ],
      encode: {
        x: 0,
        y: 1,
        tooltip: [
          1,
          ...(sizeIdx !== undefined ? [2] : []),
          ...(colorIdx !== undefined ? [3] : []),
        ],
      },
      ...(sizeIdx !== undefined ? { symbolSize } : {}),
      [POINT_COLUMNS]: {
        x: q.xColumn ?? "x",
        y: yName,
        ...(sizeIdx !== undefined ? { size: q.scatter?.size } : {}),
        ...(colorIdx !== undefined ? { color: q.scatter?.color } : {}),
      } satisfies PointColumns,
      ...(colorIdx !== undefined && colors
        ? { [COLOR_SCALE]: { extent: colors, column: q.scatter?.color } }
        : {}),
      // Sized points overlap; let the ones behind show through.
      itemStyle: { opacity: 0.8 },
      large: false,
    }),
  }
}

// Turns each x's stacked values into shares of their total, in place.
const toPercentShares = (series: Series[]) => {
  const keyOf = (point: unknown, i: number) => {
    const value = pointValue(point)
    return Array.isArray(value) ? String(value[0]) : String(i)
  }
  const valueOf = (point: unknown) => {
    const value = pointValue(point)
    return toNumberOrNull(Array.isArray(value) ? value[1] : value)
  }
  const totals = new Map<string, number>()
  for (const s of series)
    (s.data as unknown[]).forEach((point, i) => {
      const v = valueOf(point)
      if (v !== null)
        totals.set(
          keyOf(point, i),
          (totals.get(keyOf(point, i)) ?? 0) + Math.abs(v),
        )
    })
  for (const s of series) {
    s.data = (s.data as unknown[]).map((point, i) => {
      const v = valueOf(point)
      const total = totals.get(keyOf(point, i)) ?? 0
      const share =
        v === null || total === 0 ? null : (Math.abs(v) / total) * 100
      const value = pointValue(point)
      const shareValue = Array.isArray(value) ? [value[0], share] : share
      return isClickPoint(point) ? { ...point, value: shareValue } : shareValue
    })
    s[PERCENT] = true
  }
}

const buildCartesianSeries = (
  q: ResolvedQuery,
  ctx: SeriesContext,
): Series[] => {
  const out = cartesianSeriesOf(q, ctx)
  if (isPercentStack(q)) {
    // Areas stack only when asked; shares of a total always stack.
    for (const s of out) s.stack = `stack-${q.index}`
    toPercentShares(out)
  }
  return out
}

const cartesianSeriesOf = (q: ResolvedQuery, ctx: SeriesContext): Series[] => {
  const { seriesType, lineExtras, perfExtras, isStacked } =
    resolveSeriesRenderSpec(
      q.type,
      ctx.clickEnabled === true || ctx.clickColumn !== undefined,
    )
  const scatter = scatterEncoding(q)
  // A sized or coloured point carries its x in every mode.
  const xValue = (row: Dataset[number], xIdx: number) =>
    ctx.xMode === "time"
      ? row[xIdx]
      : ctx.xMode === "value"
        ? toNumberOrNull(row[xIdx])
        : toCategoryLabel(row[xIdx])
  const yAxisIndex = q.axis === "right" ? 1 : 0
  const idx = buildColumnIndexMap(q.columns)
  const xIdx = q.xColumn != null ? idx.get(q.xColumn) : undefined
  if (xIdx === undefined) return []
  const clickColumn = ctx.clickColumn
  const clickIdx = clickColumn === undefined ? undefined : idx.get(clickColumn)
  const pointsFor = (rows: Dataset, yIdx: number): unknown[] => {
    const toPoint = (row: Dataset[number]) => {
      const y = toNumberOrNull(row[yIdx])
      const value = scatter
        ? scatter.tuple(xValue(row, xIdx), row, yIdx)
        : ctx.xMode === "category"
          ? y
          : [xValue(row, xIdx), y]
      return clickColumn !== undefined && clickIdx !== undefined
        ? { value, columns: { [clickColumn]: row[clickIdx] } }
        : value
    }
    return !scatter && ctx.xMode === "category" && ctx.categoryUnion
      ? alignPointsToCategoryUnion(rows, xIdx, ctx.categoryUnion, toPoint)
      : rows.map(toPoint)
  }
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
        const data = pointsFor(rows, yIdx)
        out.push({
          name: q.yColumns.length > 1 ? `${partVal} · ${yName}` : partVal,
          [Y_COLUMN]: yName,
          type: seriesType,
          yAxisIndex,
          data,
          ...lineExtras,
          ...perfExtras,
          ...(scatter ? scatter.extras(yName) : {}),
          ...(stack ? { stack } : {}),
        })
      }
    }
    return out
  }

  for (const name of q.yColumns) {
    const yIdx = idx.get(name)
    if (yIdx === undefined) continue
    const data = pointsFor(q.dataset, yIdx)
    out.push({
      name,
      [Y_COLUMN]: name,
      type: seriesType,
      yAxisIndex,
      data,
      ...lineExtras,
      ...perfExtras,
      ...(scatter ? scatter.extras(name) : {}),
      ...(stack ? { stack } : {}),
    })
  }
  return out
}

// Rows of [x, ...values] for a series over the chart's x axis: by time or
// value, or aligned to the shared categories.
const alignedRows = (
  q: ResolvedQuery,
  xIdx: number,
  valueIdxs: number[],
  ctx: SeriesContext,
): unknown[] => {
  const clickColumn = ctx.clickColumn
  const clickIdx =
    clickColumn === undefined
      ? -1
      : q.columns.findIndex(({ name }) => name === clickColumn)
  const toPoint = (row: Dataset[number]) => {
    const x =
      ctx.xMode === "time"
        ? row[xIdx]
        : ctx.xMode === "value"
          ? toNumberOrNull(row[xIdx])
          : toCategoryLabel(row[xIdx])
    const value = [x, ...valueIdxs.map((i) => toNumberOrNull(row[i]))]
    return clickColumn !== undefined && clickIdx >= 0
      ? { value, columns: { [clickColumn]: row[clickIdx] } }
      : value
  }
  if (ctx.xMode === "category" && ctx.categoryUnion)
    return alignPointsToCategoryUnion(
      q.dataset,
      xIdx,
      ctx.categoryUnion,
      toPoint,
    ).filter((value) => value !== null)
  return q.dataset.map(toPoint)
}

// A data item that carries its row by column name, so a click can set a
// variable from any column (see clickedValue).
const rowItem = (
  q: ResolvedQuery,
  row: Dataset[number],
  value: unknown[],
  name?: string,
) => {
  const columns: Record<string, unknown> = {}
  q.columns.forEach((c, i) => {
    columns[c.name] = row[i]
  })
  return { value, columns, ...(name !== undefined ? { name } : {}) }
}

const roleIndexes = (
  q: ResolvedQuery,
  names: readonly string[],
): number[] | null => {
  const idx = buildColumnIndexMap(q.columns)
  const out = names.map((role) => {
    const column = q.roles?.[role]
    return column !== undefined ? idx.get(column) : undefined
  })
  return out.every((i) => i !== undefined) ? out : null
}

// The area between two columns (areaRange), with the query's y columns as
// lines inside it: forecast bands, percentile ranges, min-max envelopes.
const buildBandSeries = (q: ResolvedQuery, ctx: SeriesContext): Series[] => {
  const idx = buildColumnIndexMap(q.columns)
  const xIdx = q.xColumn != null ? idx.get(q.xColumn) : undefined
  const edges = roleIndexes(q, ["lower", "upper"])
  if (xIdx === undefined || !edges) return []
  const yAxisIndex = q.axis === "right" ? 1 : 0
  const band: Series = {
    name: q.name ?? `${q.roles?.lower} – ${q.roles?.upper}`,
    type: "custom",
    renderItem: "areaRange",
    clip: true,
    yAxisIndex,
    data: alignedRows(q, xIdx, edges, ctx),
    dimensions: [q.xColumn ?? "x", q.roles?.lower ?? "", q.roles?.upper ?? ""],
    encode: { x: 0, y: [1, 2], tooltip: [1, 2] },
    itemPayload: { opacity: 0.22 },
    [Y_COLUMN]: q.roles?.lower,
    animation: false,
  }
  const lines = buildCartesianSeries({ ...q, type: "line" }, ctx)
  return [band, ...lines]
}

// A bar from start to end per x: daily high-low, spreads, any range.
const buildRangeSeries = (q: ResolvedQuery, ctx: SeriesContext): Series[] => {
  const idx = buildColumnIndexMap(q.columns)
  const xIdx = q.xColumn != null ? idx.get(q.xColumn) : undefined
  const ends = roleIndexes(q, ["start", "end"])
  if (xIdx === undefined || !ends) return []
  return [
    {
      name: q.name ?? `${q.roles?.start} – ${q.roles?.end}`,
      type: "custom",
      renderItem: "barRange",
      // Bars partly outside a zoomed window are cut at the plot's edge.
      clip: true,
      yAxisIndex: q.axis === "right" ? 1 : 0,
      data: alignedRows(q, xIdx, ends, ctx),
      dimensions: [q.xColumn ?? "x", q.roles?.start ?? "", q.roles?.end ?? ""],
      encode: { x: 0, y: [1, 2], tooltip: [1, 2] },
      itemPayload: { barWidth: "60%", borderRadius: 2 },
      [Y_COLUMN]: q.roles?.start,
    },
  ]
}

/** Types drawn on axes of their own: they show alone, not with others. */
export const drawsAlone = (
  q: Pick<ResolvedQuery, "type" | "columns" | "roles">,
) =>
  q.type === "pie" ||
  q.type === "heatmap" ||
  q.type === "boxplot" ||
  (q.type === "rangeBar" && rangeIsTime(q))

const rangeIsTime = (q: Pick<ResolvedQuery, "columns" | "roles">) => {
  const start = q.columns.find((c) => c.name === q.roles?.start)
  return start !== undefined && classifyColumn(start) === "temporal"
}

const isTimeColumn = (q: ResolvedQuery, name: string | null | undefined) => {
  const column = q.columns.find((c) => c.name === name)
  return column !== undefined && classifyColumn(column) === "temporal"
}

// Category labels for times: the date, the time of day, or both, whichever
// tells the values apart.
export const timeCategoryLabels = (values: unknown[]): string[] => {
  const parsed = values.map((v) => {
    const text = typeof v === "string" ? v : toCategoryLabel(v)
    const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(:\d{2})?/.exec(text)
    return m ? { date: m[1], time: m[2], seconds: m[3] ?? "", text } : null
  })
  if (parsed.some((p) => p === null)) return values.map(toCategoryLabel)
  const ok = parsed as { date: string; time: string; seconds: string }[]
  const oneDay = ok.every((p) => p.date === ok[0].date)
  const midnight = ok.every(
    (p) => p.time === "00:00" && (p.seconds === "" || p.seconds === ":00"),
  )
  const withSeconds = new Set(ok.map((p) => p.date + p.time)).size < ok.length
  return ok.map((p) =>
    midnight
      ? p.date
      : oneDay
        ? `${p.time}${withSeconds ? p.seconds : ""}`
        : `${p.date.slice(5)} ${p.time}`,
  )
}

const categoryLabelsOf = (q: ResolvedQuery, xIdx: number): string[] => {
  const values = q.dataset.map((row) => row[xIdx])
  return isTimeColumn(q, q.xColumn)
    ? timeCategoryLabels(values)
    : values.map(toCategoryLabel)
}

// Keep raw categories distinct. A GROUP BY without ORDER BY can return
// numbers or times out of order; text stays in result order.
const heatmapAxis = (q: ResolvedQuery, index: number) => {
  const kind = classifyColumn(q.columns[index])
  const categories = [...new Set(q.dataset.map((row) => row[index]))]
  if (kind === "numeric")
    categories.sort((a, b) => {
      const x = toNumberOrNull(a)
      const y = toNumberOrNull(b)
      if (x === null || y === null)
        return (x === null ? 1 : 0) - (y === null ? 1 : 0)
      return x - y
    })
  if (kind === "temporal")
    categories.sort((a, b) => String(a).localeCompare(String(b)))
  const labels = categories.map((value) =>
    value === null
      ? "(null)"
      : value === ""
        ? "(empty)"
        : toCategoryLabel(value),
  )
  const ticks = kind === "temporal" ? timeCategoryLabels(labels) : labels
  return {
    data: categories.map((_, i) => String(i)),
    positions: new Map(categories.map((value, i) => [value, i])),
    labels,
    tick: (key: string) => ticks[Number(key)] ?? "",
  }
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
  const clickColumn = ctx.clickColumn
  const clickIdx = clickColumn === undefined ? undefined : idx.get(clickColumn)
  const point = (row: Dataset[number]) => {
    const values = candle(row)
    const value =
      ctx.xMode === "category"
        ? values
        : [
            ctx.xMode === "time" ? row[xIdx] : toNumberOrNull(row[xIdx]),
            ...values,
          ]
    return clickColumn !== undefined && clickIdx !== undefined
      ? { value, columns: { [clickColumn]: row[clickIdx] } }
      : value
  }
  const data =
    ctx.xMode === "category" && ctx.categoryUnion
      ? alignPointsToCategoryUnion(
          q.dataset,
          xIdx,
          ctx.categoryUnion,
          point,
        ).map((value) => value ?? EMPTY_CANDLE)
      : q.dataset.map(point)
  return [
    {
      name: q.name ?? "OHLC",
      type: "candlestick",
      yAxisIndex: q.axis === "right" ? 1 : 0,
      data,
    },
  ]
}

// Write the full-circle geometry too: ECharts merges options into the
// existing series when a user switches out of the half ring.
const fullPie = { center: ["50%", "50%"], startAngle: 90, endAngle: "auto" }
const PIE_GEOMETRY: Record<PieShape, Record<string, unknown>> = {
  pie: { ...fullPie, radius: "70%" },
  donut: { ...fullPie, radius: ["35%", "70%"] },
  halfDonut: {
    radius: ["45%", "90%"],
    center: ["50%", "78%"],
    startAngle: 180,
    endAngle: 360,
  },
}

const buildPieChartOption = (
  q: ResolvedQuery,
  chartText: { fontSize: number },
  legend: object,
  context: ChartContext,
): EChartsOption => {
  const idx = buildColumnIndexMap(q.columns)
  const xIdx = q.xColumn != null ? idx.get(q.xColumn) : undefined
  const yIdx = q.yColumns[0] != null ? idx.get(q.yColumns[0]) : undefined
  if (xIdx === undefined || yIdx === undefined)
    return { tooltip: { trigger: "item", textStyle: chartText } }
  const clickColumn = context.clickColumn
  const clickIdx = clickColumn === undefined ? undefined : idx.get(clickColumn)
  const data = q.dataset.map((row) => ({
    name: toCategoryLabel(row[xIdx]),
    value: toNumberOrNull(row[yIdx]) ?? 0,
    ...(clickColumn !== undefined && clickIdx !== undefined
      ? { columns: { [clickColumn]: row[clickIdx] } }
      : {}),
  }))
  return {
    tooltip: {
      trigger: "item",
      textStyle: chartText,
      valueFormatter: (v: unknown) =>
        formatValue(v, context.formats?.[q.yColumns[0]]),
    },
    legend,
    series: [
      {
        name: q.yColumns[0],
        type: "pie",
        ...PIE_GEOMETRY[q.pieShape ?? "donut"],
        avoidLabelOverlap: true,
        label: {
          show: true,
          formatter: "{b}: {d}%",
          fontSize: CHART_FONT_SIZE,
          // Labels sit at the sides, using the width the circle leaves.
          alignTo: "edge",
          edgeDistance: 8,
        },
        data,
      },
    ],
  }
}

type StandaloneContext = {
  events?: ResolvedEvents[]
  chartText: { fontSize: number }
  axisLabel: { fontSize: number; hideOverlap: boolean }
  axisName: { fontSize: number }
  legend: object
  context: ChartContext
}

const STANDALONE_GRID = {
  left: 24,
  right: 24,
  top: 24,
  bottom: GRID_BOTTOM_NO_ZOOM,
  containLabel: true,
}

const formatterOf = (context: ChartContext, column: string | undefined) => {
  const format = column ? context.formats?.[column] : undefined
  return (v: unknown) => formatValue(v, format)
}

// "09:00 → 10:30 · 1h 30m": a span's ends, as time labels, and its length.
export const spanLabel = (from: unknown, to: unknown): string => {
  const [a, b] = timeCategoryLabels([from, to])
  const ms = Date.parse(String(to)) - Date.parse(String(from))
  return Number.isFinite(ms)
    ? `${a} → ${b} · ${formatValue(ms, { kind: "duration" })}`
    : `${a} → ${b}`
}

// Cells of x × y coloured by a value: latency by hour and bucket, volume by
// time and price. Both axes are categories: numbers and times in order, text
// in the result's order.
const buildHeatmapOption = (
  q: ResolvedQuery,
  { chartText, axisLabel, axisName, context }: StandaloneContext,
): EChartsOption => {
  const idx = buildColumnIndexMap(q.columns)
  const xIdx = q.xColumn != null ? idx.get(q.xColumn) : undefined
  const roles = roleIndexes(q, ["y", "value"])
  if (xIdx === undefined || !roles) return { tooltip: { textStyle: chartText } }
  const [yIdx, valueIdx] = roles
  const x = heatmapAxis(q, xIdx)
  const y = heatmapAxis(q, yIdx)
  const data = q.dataset.map((row) =>
    rowItem(
      q,
      row,
      [
        x.positions.get(row[xIdx]),
        y.positions.get(row[yIdx]),
        toNumberOrNull(row[valueIdx]),
      ],
      toCategoryLabel(row[xIdx]),
    ),
  )
  const values = data
    .map((d) => d.value[2])
    .filter((v): v is number => typeof v === "number")
  const format = formatterOf(context, q.roles?.value)
  const colors = context.colors
  return {
    useUTC: true,
    tooltip: {
      trigger: "item",
      textStyle: chartText,
      formatter: (p: unknown) => {
        const v = (p as { value: [number, number, number | null] }).value
        return `${escapeHtml(`${x.labels[v[0]] ?? ""} · ${y.labels[v[1]] ?? ""}`)}<br/><b>${escapeHtml(format(v[2]))}</b>`
      },
    },
    grid: { ...STANDALONE_GRID, top: 36 },
    xAxis: {
      type: "category",
      data: x.data,
      name: q.xColumn ?? "",
      nameLocation: "middle",
      nameGap: X_AXIS_NAME_GAP,
      axisLabel: { ...axisLabel, formatter: x.tick },
      nameTextStyle: axisName,
      splitArea: { show: false },
    },
    yAxis: {
      type: "category",
      data: y.data,
      name: q.roles?.y ?? "",
      axisLabel: { ...axisLabel, formatter: y.tick },
      nameTextStyle: axisName,
      splitArea: { show: false },
    },
    visualMap: {
      type: "continuous",
      min: values.length ? Math.min(...values) : 0,
      max: values.length ? Math.max(...values) : 1,
      calculable: false,
      orient: "horizontal",
      left: "center",
      bottom: LEGEND_BOTTOM,
      itemWidth: 10,
      itemHeight: 140,
      textStyle: chartText,
      formatter: (v: unknown) => format(v),
      // A slider without handles shows no numbers, so label its ends.
      text: values.length
        ? [format(Math.max(...values)), format(Math.min(...values))]
        : undefined,
      ...(colors
        ? {
            inRange: {
              color: [
                withAlpha(colors.chartSeries1, 0.08),
                withAlpha(colors.chartSeries1, 0.55),
                colors.chartSeries1,
              ],
            },
          }
        : {}),
    },
    series: [
      {
        name: q.roles?.value,
        type: "heatmap",
        data,
        itemStyle: { borderRadius: 2 },
        emphasis: { itemStyle: { borderWidth: 1 } },
      },
    ] as EChartsOption["series"],
  }
}

// A box and whiskers per x from quartiles the query computes.
const buildBoxplotOption = (
  q: ResolvedQuery,
  { chartText, axisLabel, axisName, context }: StandaloneContext,
): EChartsOption => {
  const idx = buildColumnIndexMap(q.columns)
  const xIdx = q.xColumn != null ? idx.get(q.xColumn) : undefined
  const boxes = roleIndexes(q, ["min", "q1", "median", "q3", "max"])
  if (xIdx === undefined || !boxes) return { tooltip: { textStyle: chartText } }
  const format = formatterOf(context, q.roles?.median)
  const colors = context.colors
  return {
    useUTC: true,
    tooltip: {
      trigger: "item",
      textStyle: chartText,
      formatter: (p: unknown) => {
        const { name, value } = p as { name: string; value: unknown[] }
        // ECharts puts the category index first.
        const [, min, q1, median, q3, max] = value
        const lines = [
          ["max", max],
          ["q3", q3],
          ["median", median],
          ["q1", q1],
          ["min", min],
        ].map(([label, v]) => `${label} ${escapeHtml(format(v))}`)
        return `<b>${escapeHtml(name)}</b><br/>${lines.join("<br/>")}`
      },
    },
    grid: STANDALONE_GRID,
    xAxis: {
      type: "category",
      data: categoryLabelsOf(q, xIdx),
      name: q.xColumn ?? "",
      nameLocation: "middle",
      nameGap: X_AXIS_NAME_GAP,
      axisLabel,
      nameTextStyle: axisName,
    },
    yAxis: {
      type: "value",
      scale: true,
      axisLabel: { ...axisLabel, formatter: (v: number) => format(v) },
      nameTextStyle: axisName,
    },
    series: [
      {
        name: q.name ?? q.roles?.median,
        type: "boxplot",
        // Wide enough to read, never a wall of colour with few categories.
        boxWidth: [8, 56],
        ...(colors
          ? {
              itemStyle: {
                color: withAlpha(colors.chartSeries1, 0.18),
                borderColor: colors.chartSeries1,
                borderWidth: 1.5,
              },
            }
          : {}),
        data: q.dataset.map((row) =>
          rowItem(
            q,
            row,
            boxes.map((i) => toNumberOrNull(row[i])),
          ),
        ),
      },
    ] as EChartsOption["series"],
  }
}

// One lane per x value with a bar from start to end along a time axis: jobs,
// maintenance windows, shifts.
const buildGanttOption = (
  q: ResolvedQuery,
  { chartText, axisLabel, axisName, context, events }: StandaloneContext,
): EChartsOption => {
  const idx = buildColumnIndexMap(q.columns)
  const xIdx = q.xColumn != null ? idx.get(q.xColumn) : undefined
  const ends = roleIndexes(q, ["start", "end"])
  if (xIdx === undefined || !ends) return { tooltip: { textStyle: chartText } }
  const lanes = [...new Set(q.dataset.map((row) => toCategoryLabel(row[xIdx])))]
  const colors = context.colors
  const markers = events?.length ? eventsSeries(events, context) : null
  return {
    useUTC: true,
    tooltip: {
      trigger: "item",
      textStyle: chartText,
      formatter: (p: unknown) => {
        const { value, componentType } = p as {
          value: [string, unknown, unknown]
          componentType?: string
        }
        if (componentType !== "series") return ""
        return `<b>${escapeHtml(value[0])}</b><br/>${escapeHtml(spanLabel(value[1], value[2]))}`
      },
    },
    grid: STANDALONE_GRID,
    xAxis: {
      type: "time",
      axisLabel,
      nameTextStyle: axisName,
      // A line under the pointer, which linked charts follow.
      axisPointer: {
        show: true,
        type: "line",
        label: { show: false },
        // The bars' own tooltip shows; the line only marks the time.
        triggerTooltip: false,
      },
    },
    // Wheel to zoom, and linked charts zoom it; bars partly in view stay.
    dataZoom: [{ type: "inside", xAxisIndex: 0, filterMode: "weakFilter" }],
    yAxis: {
      type: "category",
      data: lanes,
      inverse: true,
      axisLabel,
      axisTick: { show: false },
      nameTextStyle: axisName,
    },
    series: [
      {
        name: q.name ?? q.xColumn ?? "",
        type: "custom",
        renderItem: "barRange",
        // Bars partly outside a zoomed window are cut at the plot's edge.
        clip: true,
        data: q.dataset.map((row) =>
          rowItem(q, row, [
            toCategoryLabel(row[xIdx]),
            row[ends[0]],
            row[ends[1]],
          ]),
        ),
        encode: { y: 0, x: [1, 2] },
        itemPayload: { barWidth: "56%", borderRadius: 3 },
        ...(colors ? { itemStyle: { color: colors.chartSeries1 } } : {}),
      },
      ...(markers ? [markers] : []),
    ] as EChartsOption["series"],
  }
}

const eventsSeries = (
  events: ResolvedEvents[],
  context: ChartContext,
): Series | null => {
  const lines: Record<string, unknown>[] = []
  const areas: Record<string, unknown>[][] = []
  const colorOf = (tone: unknown): string | undefined =>
    context.colors && isTone(tone) ? toneColor(tone, context.colors) : undefined
  for (const ev of events) {
    const idx = buildColumnIndexMap(ev.columns)
    const at = (name: string | undefined, fallback: number) =>
      name !== undefined
        ? idx.get(name)
        : fallback < ev.columns.length
          ? fallback
          : undefined
    const timeIdx = at(ev.columnsRole.time, 0)
    if (timeIdx === undefined) continue
    const labelIdx = at(ev.columnsRole.label, 1)
    const endIdx =
      ev.columnsRole.end !== undefined ? idx.get(ev.columnsRole.end) : undefined
    const toneIdx =
      ev.columnsRole.tone !== undefined
        ? idx.get(ev.columnsRole.tone)
        : undefined
    for (const row of ev.dataset) {
      const label = labelIdx !== undefined ? toCategoryLabel(row[labelIdx]) : ""
      const color =
        (toneIdx !== undefined ? colorOf(row[toneIdx]) : undefined) ??
        context.colors?.contentAccent
      if (endIdx !== undefined && row[endIdx] !== null) {
        areas.push([
          {
            xAxis: row[timeIdx],
            name: label,
            itemStyle: { color, opacity: 0.12 },
            label: { color, fontSize: 11 },
          },
          { xAxis: row[endIdx] },
        ])
      } else {
        lines.push({
          xAxis: row[timeIdx],
          name: label,
          lineStyle: { color, type: "dashed", width: 1 },
          label: { formatter: label, color, fontSize: 11 },
        })
      }
    }
  }
  if (lines.length === 0 && areas.length === 0) return null
  return {
    name: "Events",
    type: "line",
    data: [],
    silent: false,
    markLine: {
      symbol: "none",
      animation: false,
      label: { position: "end", fontSize: 11 },
      emphasis: { label: { show: true } },
      data: lines,
    },
    markArea: { silent: false, data: areas, animation: false },
  }
}

// The columns a query draws on its y-axis.
type DrawnQuery = Pick<
  ResolvedQuery,
  "type" | "yColumns" | "roles" | "columns" | "axis" | "percentStack"
>

const drawnColumns = (q: DrawnQuery): string[] => {
  if (drawsAlone(q)) return []
  const roles = q.roles ?? {}
  if (q.type === "band")
    return [...q.yColumns, roles.lower, roles.upper].filter(
      (c): c is string => c !== undefined,
    )
  if (q.type === "rangeBar")
    return [roles.start, roles.end].filter((c): c is string => c !== undefined)
  return q.yColumns
}

/**
 * The column whose format thresholds a chart draws: the first column drawn
 * on the left axis, in values (not shares of 100), whose format has them.
 * The renderer, the drawer and the render report all ask this.
 */
export const thresholdSource = (
  queries: DrawnQuery[],
  formats: ColumnFormats,
): { column: string; format: ColumnFormat } | undefined => {
  for (const q of queries) {
    if (q.axis === "right" || isPercentStack(q)) continue
    for (const column of drawnColumns(q)) {
      const format = formats[column]
      if ((format?.thresholds?.length ?? 0) > 0) return { column, format }
    }
  }
  return undefined
}

const valueFormatterFor =
  (format: ColumnFormat) =>
  (value: unknown): string =>
    Array.isArray(value)
      ? value.map((v) => formatValue(v, format)).join(" ")
      : formatValue(value, format)

export const buildEchartsOption = (
  chart: ChartGlobals,
  queries: ResolvedQuery[],
  context: ChartContext = {},
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
    return buildPieChartOption(anchor, chartText, baseLegend, context)
  const standalone: StandaloneContext = {
    chartText,
    axisLabel,
    axisName,
    legend: baseLegend,
    context,
    events: chart.events,
  }
  // These draw on axes of their own, so they show alone.
  if (anchor.type === "heatmap") return buildHeatmapOption(anchor, standalone)
  if (anchor.type === "boxplot") return buildBoxplotOption(anchor, standalone)
  if (anchor.type === "rangeBar" && rangeIsTime(anchor))
    return buildGanttOption(anchor, standalone)

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

  const ctx: SeriesContext = {
    xMode,
    categoryUnion,
    clickColumn: context.clickColumn,
    clickEnabled: context.clickEnabled,
  }
  const hasCandle = queries.some((q) => q.type === "candlestick")
  const hasBar = queries.some(
    (q) => q.type === "bar" || q.type === "stackedBar" || q.type === "rangeBar",
  )

  const series: Series[] = []
  for (const q of queries) {
    if (drawsAlone(q)) continue // these can't share an axis
    if (q.type === "candlestick") series.push(...buildCandlestickSeries(q, ctx))
    else if (q.type === "band") series.push(...buildBandSeries(q, ctx))
    else if (q.type === "rangeBar") series.push(...buildRangeSeries(q, ctx))
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
      ? (rightQueries[0].name ?? drawnColumns(rightQueries[0])[0] ?? "")
      : "")

  const rightPadding = 36

  const grid: EChartsOption["grid"] = {
    left: 24,
    right: rightPadding,
    top: 40,
    bottom: GRID_BOTTOM_NO_ZOOM,
    containLabel: true,
  }

  // Bars measure from zero, so an axis of bars alone starts there; anything
  // else fits the axis to its values.
  const barsOnly = (side: SeriesAxis) => {
    const onSide = queries.filter((q) => (q.axis ?? "left") === side)
    return (
      onSide.length > 0 &&
      onSide.every((q) => q.type === "bar" || q.type === "stackedBar")
    )
  }
  const leftAxis = {
    type: "value" as const,
    scale: !barsOnly("left"),
    axisLabel,
    nameTextStyle: axisName,
  }
  const yAxis: EChartsOption["yAxis"] = hasRight
    ? [
        leftAxis,
        {
          type: "value",
          scale: !barsOnly("right"),
          position: "right",
          name: rightTitle,
          nameTextStyle: axisName,
          axisLabel,
          splitLine: { show: false },
          // Keep both keys even when unset: chart updates merge into the prior
          // option, and an omitted key would keep a cleared bound on screen.
          min: chart.rightAxis?.min,
          max: chart.rightAxis?.max,
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
          ...(context.preciseTimePointer
            ? { axisPointer: { snap: false } }
            : {}),
          // Extend the time axis 5% on each side so range bars sit inside the
          // plot. Candles and bars need no room: ECharts 6.1 keeps their
          // shapes inside the axis (containShape).
          ...(queries.some((q) => q.type === "rangeBar")
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

  // Points are read one at a time; everything else across x.
  const onlyPoints =
    series.length > 0 && series.every((s) => s.type === "scatter")
  const tooltip: EChartsOption["tooltip"] = {
    trigger: onlyPoints ? "item" : "axis",
    textStyle: chartText,
    ...(hasCandle ? { axisPointer: { type: "cross" } } : {}),
  }

  const formats = context.formats ?? {}
  // Series named after a column take that column's format in the tooltip;
  // an axis whose series all share one format labels with it.
  const formatOf = (name: unknown): ColumnFormat | undefined =>
    typeof name === "string" ? formats[name] : undefined
  const axisFormats: (ColumnFormat | undefined)[][] = [[], []]
  for (const q of queries) {
    const target = axisFormats[q.axis === "right" ? 1 : 0]
    for (const y of drawnColumns(q))
      target.push(isPercentStack(q) ? PERCENT_FORMAT : formatOf(y))
  }
  for (const s of series) {
    const format = s[PERCENT] ? PERCENT_FORMAT : formatOf(s[Y_COLUMN])
    const points = s[POINT_COLUMNS] as PointColumns | undefined
    delete s[Y_COLUMN]
    delete s[PERCENT]
    delete s[POINT_COLUMNS]
    s.tooltip = {
      formatter: points ? pointTooltip(points, formats) : undefined,
      valueFormatter: !points && format ? valueFormatterFor(format) : undefined,
    }
  }
  const sharedFormat = (list: (ColumnFormat | undefined)[]) =>
    list.length > 0 &&
    list.every(
      (f) => f !== undefined && JSON.stringify(f) === JSON.stringify(list[0]),
    )
      ? list[0] === PERCENT_FORMAT || list.every((f) => f !== PERCENT_FORMAT)
        ? list[0]
        : undefined
      : undefined
  const withAxisFormat = (
    axis: Record<string, unknown>,
    list: (ColumnFormat | undefined)[],
  ) => {
    const format = sharedFormat(list)
    // Shares of 100 run from 0 to 100 and read as percentages.
    if (format === PERCENT_FORMAT)
      return {
        ...axis,
        min: 0,
        max: 100,
        axisLabel: {
          ...(axis.axisLabel as object),
          formatter: (v: number) => `${v}%`,
        },
      }
    return {
      min: undefined,
      max: undefined,
      ...axis,
      axisLabel: {
        ...(axis.axisLabel as object),
        formatter: format
          ? (v: number) => formatValue(v, { ...format, prefix: "", suffix: "" })
          : undefined,
      },
    }
  }
  const formattedYAxis = Array.isArray(yAxis)
    ? yAxis.map((a, i) =>
        withAxisFormat(a as Record<string, unknown>, axisFormats[i] ?? []),
      )
    : withAxisFormat(yAxis as Record<string, unknown>, axisFormats[0])

  // Bars lying down, when every series is a bar of some kind.
  const horizontal =
    chart.horizontal === true &&
    series.length > 0 &&
    queries.every((q) => HORIZONTAL_TYPES.has(q.type))

  // The left axis's thresholds, from the first drawn column that has them.
  const thresholdFormat = chart.thresholds
    ? thresholdSource(queries, formats)?.format
    : undefined
  const thresholdSeries =
    chart.thresholds && thresholdFormat
      ? thresholdMarks(
          chart.thresholds,
          thresholdFormat,
          series,
          horizontal,
          context,
        )
      : null

  const markers =
    xMode === "time" && chart.events?.length && !horizontal
      ? eventsSeries(chart.events, context)
      : null
  const helpers = [markers, thresholdSeries].filter(
    (s): s is Series => s !== null,
  )
  series.push(...helpers)
  // Marker series carry no data: keep them out of the legend.
  const legend = helpers.length
    ? {
        ...baseLegend,
        data: series
          .filter((s) => !helpers.includes(s))
          .map((s) => s.name as string),
      }
    : baseLegend

  // Thresholds stay in view even when every value is below them.
  const valueAxes = (
    Array.isArray(formattedYAxis) ? formattedYAxis : [formattedYAxis]
  ).map((a, i) =>
    i === 0 && thresholdSeries && thresholdFormat?.thresholds
      ? {
          ...(a as object),
          dataMin: Math.min(...thresholdFormat.thresholds.map((t) => t.value)),
          dataMax: Math.max(...thresholdFormat.thresholds.map((t) => t.value)),
        }
      : a,
  )
  const yAxisOut = Array.isArray(formattedYAxis) ? valueAxes : valueAxes[0]

  const colorScales = colorScalesOf(series, context)

  const option: EChartsOption = {
    // The server sends UTC and every result grid prints it verbatim, so the
    // axis and tooltip must not re-render those instants in the browser's zone.
    useUTC: true,
    tooltip,
    legend,
    grid:
      colorScales.length > 1
        ? { ...grid, top: 40 + (colorScales.length - 1) * 24 }
        : grid,
    xAxis,
    yAxis: yAxisOut as EChartsOption["yAxis"],
    visualMap: colorScales.length === 1 ? colorScales[0] : colorScales,
    series: series as EChartsOption["series"],
  }
  return horizontal ? layDown(option) : option
}

const HORIZONTAL_TYPES = new Set<ChartType>(["bar", "stackedBar", "rangeBar"])

const PERCENT_FORMAT: ColumnFormat = { decimals: 1, suffix: "%" }

// Different colour measurements need independent scales and formatting.
const colorScalesOf = (series: Series[], context: ChartContext) => {
  const groups = new Map<
    string,
    { indices: number[]; min: number; max: number }
  >()
  series.forEach((item, index) => {
    const scale = item[COLOR_SCALE] as
      | { extent: [number, number]; column: string }
      | undefined
    delete item[COLOR_SCALE]
    if (!scale) return
    const {
      extent: [min, max],
      column,
    } = scale
    const group = groups.get(column)
    if (group) {
      group.indices.push(index)
      group.min = Math.min(group.min, min)
      group.max = Math.max(group.max, max)
    } else groups.set(column, { indices: [index], min, max })
  })
  const colors = context.colors
  return [...groups].map(([column, { indices, min, max }], index) => {
    const format = context.formats?.[column]
    return {
      type: "continuous" as const,
      seriesIndex: indices,
      dimension: 3,
      min,
      max,
      calculable: false,
      orient: "horizontal" as const,
      right: 8,
      top: 24 * index,
      itemWidth: 10,
      itemHeight: 100,
      textStyle: { fontSize: CHART_FONT_SIZE },
      text: [
        readableValue(max, format),
        `${column}  ${readableValue(min, format)}`,
      ],
      ...(colors
        ? {
            inRange: {
              color: [
                withAlpha(colors.chartSeries1, 0.25),
                colors.chartSeries1,
              ],
            },
          }
        : {}),
    }
  })
}

// Lines at, or shaded bands between, a format's thresholds, on the value axis.
const thresholdMarks = (
  marks: NonNullable<ChartGlobals["thresholds"]>,
  format: ColumnFormat,
  series: Series[],
  horizontal: boolean,
  context: ChartContext,
): Series => {
  const axis = horizontal ? "xAxis" : "yAxis"
  const colorOf = (tone: Tone | undefined) =>
    tone && context.colors ? toneColor(tone, context.colors) : undefined
  const thresholds = [...(format.thresholds ?? [])].sort(
    (a, b) => a.value - b.value,
  )
  if (marks === "lines")
    return {
      name: "Thresholds",
      type: "line",
      data: [],
      silent: true,
      markArea: { data: [] },
      markLine: {
        symbol: "none",
        animation: false,
        data: thresholds.map((t) => ({
          [axis]: t.value,
          lineStyle: { color: colorOf(t.tone), type: "dashed", width: 1 },
          label: {
            formatter: formatValue(t.value, format),
            position: "insideEndTop",
            color: colorOf(t.tone),
            fontSize: 11,
          },
        })),
      },
    }
  // Bands reach past the data so they fill the plot; the grid clips them.
  let lo = Infinity
  let hi = -Infinity
  const include = (value: number) => {
    if (!Number.isFinite(value)) return
    lo = Math.min(lo, value)
    hi = Math.max(hi, value)
  }
  for (const { value } of thresholds) include(value)
  for (const { data } of series) {
    if (!Array.isArray(data)) continue
    for (const point of data as unknown[]) {
      const raw = pointValue(point)
      const value = toNumberOrNull(Array.isArray(raw) ? raw[1] : raw)
      if (value !== null) include(value)
    }
  }
  const reach = Math.max(hi - lo, Math.abs(hi), 1) * 10
  return {
    name: "Thresholds",
    type: "line",
    data: [],
    silent: true,
    markLine: { data: [] },
    markArea: {
      silent: true,
      animation: false,
      data: thresholdBands(format, lo - reach, hi + reach).map((band) => [
        {
          [axis]: band.from,
          itemStyle: {
            color: colorOf(band.tone),
            opacity: band.tone === "muted" ? 0 : 0.1,
          },
        },
        { [axis]: band.to },
      ]),
    },
  }
}

// Swaps the axes of a bar chart: categories down the side, values across.
const layDown = (option: EChartsOption): EChartsOption => {
  const values = (
    Array.isArray(option.yAxis) ? option.yAxis : [option.yAxis]
  ) as Record<string, unknown>[]
  const across = values.map((a, i) => (i === 1 ? { ...a, position: "top" } : a))
  const side = option.xAxis as Record<string, unknown>
  const down = {
    ...side,
    // The axis labels name the rows; a title beside them only crowds them.
    name: "",
    // Rows read top to bottom in the result's order.
    ...(side.type === "category" ? { inverse: true } : {}),
  }
  const series = (option.series as Series[]).map((s) => {
    const { yAxisIndex, ...rest } = s as Series & { yAxisIndex?: number }
    const next: Series = { ...rest, xAxisIndex: yAxisIndex ?? 0 }
    if (s.type === "custom") next.encode = { y: 0, x: [1, 2], tooltip: [1, 2] }
    else if (
      (s.data as unknown[] | undefined)?.some((point) =>
        Array.isArray(pointValue(point)),
      )
    )
      next.encode = { x: 1, y: 0 }
    return next
  })
  return {
    ...option,
    xAxis: (across.length === 1 ? across[0] : across) as EChartsOption["xAxis"],
    yAxis: down as EChartsOption["yAxis"],
    series: series as EChartsOption["series"],
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
  const typeOf = (axis: unknown) =>
    (Array.isArray(axis) ? axis[0] : axis) as { type?: string } | undefined
  // Bars lying down zoom along their rows, by wheel only.
  if (
    typeOf(option.xAxis)?.type === "value" &&
    typeOf(option.yAxis)?.type !== "value"
  )
    return {
      ...option,
      dataZoom: [
        { type: "inside", yAxisIndex: 0, disabled: !density.wheel },
        { type: "slider", yAxisIndex: 0, show: false },
      ],
    }
  // A chart that brings its own inside zoom (the timeline) keeps its settings.
  const own = (Array.isArray(option.dataZoom) ? option.dataZoom : []).find(
    (z) => (z as { type?: string }).type === "inside",
  )
  return {
    ...option,
    grid: {
      ...(option.grid as object),
      bottom: density.slider ? GRID_BOTTOM_WITH_ZOOM : GRID_BOTTOM_NO_ZOOM,
    },
    dataZoom: [
      own
        ? { ...(own as object), type: "inside", disabled: !density.wheel }
        : { type: "inside", disabled: !density.wheel },
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
