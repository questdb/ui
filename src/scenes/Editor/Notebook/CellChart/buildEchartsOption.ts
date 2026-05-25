import type { EChartsOption } from "echarts"
import type { ColumnDefinition } from "../../../../utils/questdb/types"
import type { ChartConfig } from "./chartTypes"
import {
  MAX_PARTITION_SERIES,
  classifyColumn,
  groupColumns,
} from "./inferChartConfig"

export type ExtraSeriesSource = {
  label: string
  columns: ColumnDefinition[]
  dataset: (boolean | string | number | null)[][]
}

const DATAZOOM_THRESHOLD = 200

// Bottom-band layout: legend → dataZoom slider → x-axis labels, stacking
// up from the container bottom. Gaps absorb rendering jitter so the three
// never overlap at fontSize=12.
const LEGEND_BOTTOM = 3
const SLIDER_HEIGHT = 18
const SLIDER_BOTTOM = 40
const GRID_BOTTOM_NO_ZOOM = 48
const GRID_BOTTOM_WITH_ZOOM = 78

type Dataset = (boolean | string | number | null)[][]

const indexByName = (columns: ColumnDefinition[]): Map<string, number> => {
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

const toLabel = (v: unknown): string => {
  if (v === null || v === undefined) return ""
  if (typeof v === "string") return v
  if (typeof v === "number" || typeof v === "boolean") return String(v)
  return JSON.stringify(v)
}

const extractColumn = (dataset: Dataset, idx: number): unknown[] =>
  dataset.map((row) => row[idx])

export const buildEchartsOption = (
  config: ChartConfig,
  columns: ColumnDefinition[],
  dataset: Dataset,
  extraSources: ExtraSeriesSource[] = [],
): EChartsOption => {
  const idx = indexByName(columns)
  const xIdx = config.xColumn != null ? idx.get(config.xColumn) : undefined
  const xCol =
    config.xColumn != null
      ? columns.find((c) => c.name === config.xColumn)
      : undefined
  const xRole = xCol ? classifyColumn(xCol) : "other"
  const xIsTime = xRole === "temporal"

  const CHART_FONT_SIZE = 12
  const chartText = { fontSize: CHART_FONT_SIZE }
  const axisLabel = { fontSize: CHART_FONT_SIZE }
  const axisName = { fontSize: CHART_FONT_SIZE }

  const baseTooltip: EChartsOption["tooltip"] =
    config.type === "pie" || config.type === "candlestick"
      ? { trigger: "item", textStyle: chartText }
      : { trigger: "axis", textStyle: chartText }

  const baseLegend = {
    type: "scroll" as const,
    bottom: LEGEND_BOTTOM,
    textStyle: chartText,
  }

  const hasZoom = dataset.length > DATAZOOM_THRESHOLD
  const sliderZoom = {
    type: "slider" as const,
    height: SLIDER_HEIGHT,
    bottom: SLIDER_BOTTOM,
    textStyle: chartText,
  }

  const trimmedName = config.name?.trim() ?? ""
  const hasName = trimmedName.length > 0
  const baseTitle: EChartsOption["title"] | undefined = hasName
    ? {
        text: trimmedName,
        left: "center",
        top: 8,
        textStyle: { color: "#f8f8f2", fontSize: 18, fontWeight: "bold" },
      }
    : undefined

  // Reserves space past the plot for two things containLabel doesn't:
  // the x-axis name (nameLocation:"end") and the rightmost tick label's
  // overhang on long timestamp formats.
  const NAME_CHAR_WIDTH = 6
  const NAME_GAP = 15
  const TICK_OVERHANG_FUDGE = 12
  const MAX_RIGHT = 120
  const xAxisNameLen = (config.xColumn ?? "").length
  const rightPadding =
    xAxisNameLen > 0
      ? Math.min(
          MAX_RIGHT,
          NAME_GAP + xAxisNameLen * NAME_CHAR_WIDTH + TICK_OVERHANG_FUDGE,
        )
      : TICK_OVERHANG_FUDGE

  const baseGrid: EChartsOption["grid"] = {
    left: 24,
    right: rightPadding,
    top: hasName ? 72 : 24,
    bottom: hasZoom ? GRID_BOTTOM_WITH_ZOOM : GRID_BOTTOM_NO_ZOOM,
    containLabel: true,
  }

  if (config.type === "pie" && xIdx !== undefined && config.yColumns[0]) {
    const yIdx = idx.get(config.yColumns[0])
    if (yIdx === undefined) return { tooltip: baseTooltip }
    const data = dataset.map((row) => ({
      name: toLabel(row[xIdx]),
      value: toNumberOrNull(row[yIdx]) ?? 0,
    }))
    return {
      title: baseTitle,
      tooltip: { trigger: "item", textStyle: chartText },
      legend: baseLegend,
      series: [
        {
          name: config.yColumns[0],
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

  // echarts candlestick order: [open, close, low, high].
  if (config.type === "candlestick" && config.ohlc && xIdx !== undefined) {
    const oIdx = idx.get(config.ohlc.open)
    const cIdx = idx.get(config.ohlc.close)
    const lIdx = idx.get(config.ohlc.low)
    const hIdx = idx.get(config.ohlc.high)
    if (
      oIdx === undefined ||
      cIdx === undefined ||
      lIdx === undefined ||
      hIdx === undefined
    ) {
      return { tooltip: baseTooltip }
    }
    const xData = extractColumn(dataset, xIdx)
    const candleData = dataset.map((row) => [
      toNumberOrNull(row[oIdx]) ?? 0,
      toNumberOrNull(row[cIdx]) ?? 0,
      toNumberOrNull(row[lIdx]) ?? 0,
      toNumberOrNull(row[hIdx]) ?? 0,
    ])
    return {
      title: baseTitle,
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "cross" },
        textStyle: chartText,
      },
      legend: { bottom: LEGEND_BOTTOM, textStyle: chartText },
      grid: baseGrid,
      xAxis: xIsTime
        ? {
            type: "time",
            name: config.xColumn ?? "",
            axisLabel,
            nameTextStyle: axisName,
            // Extend the time axis 5% on each side so candle bodies sit
            // inside the plot (time axis is boundaryGap:false by default).
            min: (v) => v.min - (v.max - v.min) * 0.05,
            max: (v) => v.max + (v.max - v.min) * 0.05,
          }
        : {
            type: "category",
            data: xData.map(toLabel),
            name: config.xColumn ?? "",
            axisLabel,
            nameTextStyle: axisName,
            boundaryGap: true,
          },
      yAxis: {
        type: "value",
        scale: true,
        axisLabel,
        nameTextStyle: axisName,
      },
      dataZoom: hasZoom ? [{ type: "inside" }, sliderZoom] : undefined,
      series: [
        {
          name: "OHLC",
          type: "candlestick",
          data: (xIsTime
            ? candleData.map((v, i) => [xData[i], ...v])
            : candleData) as never,
        },
      ],
    }
  }

  if (config.type === "scatter" && xIdx !== undefined) {
    const series = config.yColumns
      .map((name) => {
        const yIdx = idx.get(name)
        if (yIdx === undefined) return null
        return {
          name,
          type: "scatter" as const,
          large: true,
          data: dataset.map((row) => [
            toNumberOrNull(row[xIdx]) ?? 0,
            toNumberOrNull(row[yIdx]) ?? 0,
          ]),
        }
      })
      .filter((s): s is NonNullable<typeof s> => s !== null)
    return {
      title: baseTitle,
      tooltip: { trigger: "item", textStyle: chartText },
      legend: baseLegend,
      grid: baseGrid,
      xAxis: {
        type: "value",
        scale: true,
        name: config.xColumn ?? "",
        axisLabel,
        nameTextStyle: axisName,
      },
      yAxis: {
        type: "value",
        scale: true,
        axisLabel,
        nameTextStyle: axisName,
      },
      series,
    }
  }

  if (xIdx === undefined) return { tooltip: baseTooltip }

  const xData = extractColumn(dataset, xIdx)
  const isLineFamily = config.type === "line" || config.type === "area"
  const isStacked = config.type === "stackedBar"
  const seriesType: "line" | "bar" = isLineFamily ? "line" : "bar"

  const lineExtras =
    config.type === "area"
      ? { areaStyle: {}, smooth: true, symbol: "none" as const }
      : {}

  const perfExtras: { sampling?: "lttb"; large?: boolean } = isLineFamily
    ? { sampling: "lttb" }
    : { large: true }

  // Long → wide pivot: each distinct partitionByColumn value → its own series.
  const partIdx =
    config.partitionByColumn != null
      ? idx.get(config.partitionByColumn)
      : undefined

  const series: {
    name: string
    type: "line" | "bar"
    data: never
    areaStyle?: object
    smooth?: boolean
    symbol?: "none"
    stack?: string
    sampling?: "lttb"
    large?: boolean
  }[] = []

  if (partIdx !== undefined) {
    const groups = new Map<
      string,
      Map<string, (boolean | string | number | null)[][]>
    >()
    for (const row of dataset) {
      const partVal = toLabel(row[partIdx])
      let metricMap = groups.get(partVal)
      if (!metricMap) {
        metricMap = new Map()
        groups.set(partVal, metricMap)
      }
      for (const yName of config.yColumns) {
        const yIdx = idx.get(yName)
        if (yIdx === undefined) continue
        let pts = metricMap.get(yName)
        if (!pts) {
          pts = []
          metricMap.set(yName, pts)
        }
        const yVal = toNumberOrNull(row[yIdx])
        pts.push(xIsTime ? [row[xIdx], yVal] : [yVal])
      }
    }

    // Alphabetical sort so the truncation is deterministic across runs.
    const sortedKeys = [...groups.keys()].sort().slice(0, MAX_PARTITION_SERIES)
    for (const partVal of sortedKeys) {
      const metricMap = groups.get(partVal)
      if (!metricMap) continue
      for (const [yName, pts] of metricMap) {
        series.push({
          name: config.yColumns.length > 1 ? `${partVal} · ${yName}` : partVal,
          type: seriesType,
          data: (xIsTime ? pts : pts.map((p) => p[0])) as never,
          ...lineExtras,
          ...perfExtras,
          ...(isStacked && { stack: "total" }),
        })
      }
    }
  } else {
    for (const name of config.yColumns) {
      const yIdx = idx.get(name)
      if (yIdx === undefined) continue
      const data = xIsTime
        ? dataset.map((row) => [row[xIdx], toNumberOrNull(row[yIdx])])
        : dataset.map((row) => toNumberOrNull(row[yIdx]))
      series.push({
        name,
        type: seriesType,
        data: data as never,
        ...lineExtras,
        ...perfExtras,
        ...(isStacked && { stack: "total" }),
      })
    }
  }

  // Sibling-tab overlays only make sense with a temporal x-axis (echarts
  // merges by time so we don't have to align categories).
  if (xIsTime && extraSources.length > 0) {
    const yColumnSet = new Set(config.yColumns)
    const anchorColumnNames = new Set(columns.map((c) => c.name))
    for (const src of extraSources) {
      const srcGroups = groupColumns(src.columns)
      const srcXCol = srcGroups.temporal[0]
      if (!srcXCol) continue
      const srcXIdx = src.columns.findIndex((c) => c.name === srcXCol.name)
      if (srcXIdx < 0) continue
      for (const numericCol of srcGroups.numeric) {
        if (!yColumnSet.has(numericCol.name)) continue
        // Skip names already emitted by the anchor branch above to avoid
        // duplicate legend entries.
        if (anchorColumnNames.has(numericCol.name)) continue
        const yI = src.columns.findIndex((c) => c.name === numericCol.name)
        if (yI < 0) continue
        const data = src.dataset.map((row) => [
          row[srcXIdx],
          toNumberOrNull(row[yI]),
        ])
        series.push({
          name: numericCol.name,
          type: seriesType,
          data: data as never,
          ...lineExtras,
          ...perfExtras,
        })
      }
    }
  }

  return {
    title: baseTitle,
    tooltip: baseTooltip,
    legend: baseLegend,
    grid: baseGrid,
    xAxis: xIsTime
      ? {
          type: "time",
          name: config.xColumn ?? "",
          axisLabel,
          nameTextStyle: axisName,
        }
      : {
          type: "category",
          data: xData.map(toLabel),
          name: config.xColumn ?? "",
          boundaryGap: seriesType === "bar",
          axisLabel,
          nameTextStyle: axisName,
        },
    yAxis: {
      type: "value",
      scale: true,
      axisLabel,
      nameTextStyle: axisName,
    },
    dataZoom: hasZoom ? [{ type: "inside" }, sliderZoom] : undefined,
    series,
  }
}
