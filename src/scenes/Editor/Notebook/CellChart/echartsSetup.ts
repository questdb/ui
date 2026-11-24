import * as echarts from "echarts/core"
import {
  BarChart,
  BoxplotChart,
  CandlestickChart,
  ChordChart,
  CustomChart,
  EffectScatterChart,
  FunnelChart,
  GaugeChart,
  GraphChart,
  HeatmapChart,
  LineChart,
  LinesChart,
  MapChart,
  ParallelChart,
  PictorialBarChart,
  PieChart,
  RadarChart,
  SankeyChart,
  ScatterChart,
  SunburstChart,
  ThemeRiverChart,
  TreeChart,
  TreemapChart,
} from "echarts/charts"
import {
  AriaComponent,
  AxisPointerComponent,
  BrushComponent,
  CalendarComponent,
  DataZoomComponent,
  DatasetComponent,
  GeoComponent,
  GraphicComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  MarkPointComponent,
  MatrixComponent,
  ParallelComponent,
  PolarComponent,
  RadarComponent,
  SingleAxisComponent,
  TitleComponent,
  ToolboxComponent,
  TooltipComponent,
  TransformComponent,
  VisualMapComponent,
} from "echarts/components"
import {
  AxisBreak,
  LabelLayout,
  LegacyGridContainLabel,
  ScatterJitter,
} from "echarts/features"
import { CanvasRenderer } from "echarts/renderers"
import type { CustomSeriesRenderItem } from "echarts"
import lineRange from "@echarts-x/custom-line-range"
import stage from "@echarts-x/custom-stage"
import violin from "@echarts-x/custom-violin"
import contour from "@echarts-x/custom-contour"
import segmentedDoughnut from "@echarts-x/custom-segmented-doughnut"

echarts.use([
  BarChart,
  BoxplotChart,
  CandlestickChart,
  ChordChart,
  CustomChart,
  EffectScatterChart,
  FunnelChart,
  GaugeChart,
  GraphChart,
  HeatmapChart,
  LineChart,
  LinesChart,
  MapChart,
  ParallelChart,
  PictorialBarChart,
  PieChart,
  RadarChart,
  SankeyChart,
  ScatterChart,
  SunburstChart,
  ThemeRiverChart,
  TreeChart,
  TreemapChart,
  AriaComponent,
  AxisPointerComponent,
  BrushComponent,
  CalendarComponent,
  DataZoomComponent,
  DatasetComponent,
  GeoComponent,
  GraphicComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  MarkPointComponent,
  MatrixComponent,
  ParallelComponent,
  PolarComponent,
  RadarComponent,
  SingleAxisComponent,
  TitleComponent,
  ToolboxComponent,
  TooltipComponent,
  TransformComponent,
  VisualMapComponent,
  AxisBreak,
  LabelLayout,
  // Our options still use `grid.containLabel`; ECharts 6 moved it to an
  // opt-in feature.
  LegacyGridContainLabel,
  ScatterJitter,
  CanvasRenderer,
])

// Official custom series, referenced by name from an option
// (`{ type: "custom", renderItem: "barRange" }`).
for (const installer of [
  lineRange,
  stage,
  violin,
  contour,
  segmentedDoughnut,
]) {
  echarts.use(installer)
}

export { BUILTIN_CUSTOM_SERIES } from "./customSeriesNames"

// The official bar range draws its values as text in degrees Celsius; this one
// draws only the bar, vertical or horizontal by `encode`: a range [low, high]
// on y per x category, or on x per y category.
export const barRangeRenderItem: CustomSeriesRenderItem = (params, api) => {
  const encode = (params as unknown as { encode: { x: number[]; y: number[] } })
    .encode
  const horizontal = encode.x.length === 2
  const at = api.value(horizontal ? encode.y[0] : encode.x[0])
  const from = api.value(horizontal ? encode.x[0] : encode.y[0])
  const to = api.value(horizontal ? encode.x[1] : encode.y[1])
  const start = api.coord(horizontal ? [from, at] : [at, from])
  const end = api.coord(horizontal ? [to, at] : [at, to])
  const payload =
    (
      params as unknown as {
        itemPayload?: { barWidth?: number | string; borderRadius?: number }
      }
    ).itemPayload ?? {}
  // A category axis has a band per value; a time or value axis has none, so
  // the bars share the plot's length between them.
  const sized = (api.size?.(horizontal ? [0, 1] : [1, 0]) as number[])[
    horizontal ? 1 : 0
  ]
  const coordSys = (
    params as unknown as { coordSys?: { width?: number; height?: number } }
  ).coordSys
  const length = (horizontal ? coordSys?.height : coordSys?.width) ?? 0
  const count = Math.max(
    (params as unknown as { dataInsideLength?: number }).dataInsideLength ?? 1,
    1,
  )
  const band = sized > 2 ? sized : length / count
  const raw = payload.barWidth ?? "60%"
  const thickness =
    typeof raw === "string" && raw.endsWith("%")
      ? (parseFloat(raw) / 100) * band
      : Number(raw)
  const shape = horizontal
    ? {
        x: Math.min(start[0], end[0]),
        y: start[1] - thickness / 2,
        width: Math.max(Math.abs(end[0] - start[0]), 1),
        height: thickness,
      }
    : {
        x: start[0] - thickness / 2,
        y: Math.min(start[1], end[1]),
        width: thickness,
        height: Math.max(Math.abs(end[1] - start[1]), 1),
      }
  return {
    type: "rect",
    shape: { ...shape, r: payload.borderRadius ?? 2 },
    style: { fill: api.visual("color") as string },
  }
}

echarts.registerCustomSeries("barRange", barRangeRenderItem)

// The area between a low and a high value along x, on any x axis (the
// official line range places points by index, so only on categories). Drawn
// once, from the last item; rows without both values break the area.
export const areaRangeRenderItem: CustomSeriesRenderItem = (params, api) => {
  const p = params as unknown as {
    dataIndexInside: number
    dataInsideLength: number
    encode: { x: number[]; y: number[] }
    itemPayload?: { opacity?: number; clickEnabled?: boolean }
  }
  const count = p.dataInsideLength
  const [xDim] = p.encode.x
  const [lowDim, highDim] = p.encode.y
  const pointAt = (i: number) => {
    if (i < 0 || i >= count) return null
    const x = api.value(xDim, i)
    const low = api.value(lowDim, i)
    const high = api.value(highDim, i)
    if (
      typeof low !== "number" ||
      typeof high !== "number" ||
      !Number.isFinite(low) ||
      !Number.isFinite(high)
    )
      return null
    const bottom = api.coord([x, low])
    const top = api.coord([x, high])
    return [...bottom, ...top].every(Number.isFinite) ? { bottom, top } : null
  }
  const selectedHit = () => {
    if (!p.itemPayload?.clickEnabled) return []
    const i = p.dataIndexInside
    const here = pointAt(i)
    const previous = pointAt(i - 1)
    const next = pointAt(i + 1)
    if (!here || (!previous && !next)) return []
    const midpoint = (a: number[], b: number[]) => [
      (a[0] + b[0]) / 2,
      (a[1] + b[1]) / 2,
    ]
    return [
      {
        type: "polygon" as const,
        shape: {
          points: [
            previous ? midpoint(previous.bottom, here.bottom) : here.bottom,
            here.bottom,
            next ? midpoint(next.bottom, here.bottom) : here.bottom,
            next ? midpoint(next.top, here.top) : here.top,
            here.top,
            previous ? midpoint(previous.top, here.top) : here.top,
          ],
        },
        style: { fill: "transparent" },
      },
    ]
  }
  const hits = selectedHit()
  // Only the last visible row draws the continuous fill. Its silent
  // geometry cannot intercept the individual rows' selection footprints.
  if (p.dataIndexInside !== count - 1) return { type: "group", children: hits }
  const segments: number[][][] = []
  let lows: number[][] = []
  let highs: number[][] = []
  const close = () => {
    if (lows.length > 1) segments.push([...lows, ...highs.reverse()])
    lows = []
    highs = []
  }
  for (let i = 0; i < count; i++) {
    const x = api.value(xDim, i)
    const low = api.value(lowDim, i)
    const high = api.value(highDim, i)
    if ([low, high].some((v) => typeof v !== "number" || Number.isNaN(v))) {
      close()
      continue
    }
    lows.push(api.coord([x, low]))
    highs.push(api.coord([x, high]))
  }
  close()
  return {
    type: "group",
    children: [
      ...hits,
      ...segments.map((points) => ({
        type: "polygon" as const,
        shape: { points },
        style: {
          fill: api.visual("color") as string,
          opacity: p.itemPayload?.opacity ?? 0.2,
        },
        silent: true,
      })),
    ],
  }
}

echarts.registerCustomSeries("areaRange", areaRangeRenderItem)

// Order-flow footprint: one cell per (bar, price level) with the volume sold
// and bought there, written "sell × buy". A level where one side outweighs
// the other `ratio` times (3 by default) is filled with `color` (buyers) or
// `color0` (sellers); the bar's point of control (`poc` is 1) is outlined in
// `borderColor`. x is the bar: a category, or a time with `dt` the bar's
// length in ms; y is the level's lower price and `step` its height. `buy`,
// `sell` and `poc` name (or index) the dimensions to read.
type FootprintPayload = {
  step?: number
  dt?: number
  buy?: string | number
  sell?: string | number
  poc?: string | number
  ratio?: number
  // The share of the bar kept free on its left, for a candle beside it.
  inset?: number
  color?: string
  color0?: string
  borderColor?: string
  label?: { color?: string }
}

const volumeText = (v: number): string => {
  const a = Math.abs(v)
  if (a === 0) return "0"
  if (a >= 1e6) return `${(v / 1e6).toFixed(1)}M`
  if (a >= 1e4) return `${(v / 1e3).toFixed(1)}K`
  if (a >= 100) return v.toFixed(0)
  if (a >= 10) return v.toFixed(1)
  return v.toFixed(2)
}

// A volume, or null when the side reported none (NULL).
const volumeOf = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : v == null ? NaN : Number(v)
  return Number.isFinite(n) ? n : null
}

export const footprintRenderItem: CustomSeriesRenderItem = (params, api) => {
  const payload =
    (params as unknown as { itemPayload?: FootprintPayload }).itemPayload ?? {}
  const encode = (params as unknown as { encode: { x: number[]; y: number[] } })
    .encode
  const x = api.value(encode.x[0]) as number
  const level = api.value(encode.y[0]) as number
  const step = payload.step && payload.step > 0 ? payload.step : 1
  const buy = volumeOf(api.value(payload.buy ?? "buy"))
  const sell = volumeOf(api.value(payload.sell ?? "sell"))
  const poc =
    payload.poc !== undefined && volumeOf(api.value(payload.poc)) === 1
  let left: number
  let right: number
  if (payload.dt && payload.dt > 0) {
    left = api.coord([x, level])[0]
    right = api.coord([x + payload.dt, level])[0]
  } else {
    const band = (api.size?.([1, 0]) as number[])[0]
    const center = api.coord([x, level])[0]
    left = center - band / 2
    right = center + band / 2
  }
  const width = right - left
  const cellLeft = left + width * (payload.inset ?? 0.04)
  const cellRight = right - width * 0.04
  const top = api.coord([x, level + step])[1]
  const bottom = api.coord([x, level])[1]
  const height = bottom - top
  const ratio = payload.ratio ?? 3
  // An imbalance needs both sides: a level missing one is not one-sided.
  const fill =
    buy !== null &&
    sell !== null &&
    buy > 0 &&
    buy >= ratio * sell &&
    payload.color
      ? payload.color
      : buy !== null &&
          sell !== null &&
          sell > 0 &&
          sell >= ratio * buy &&
          payload.color0
        ? payload.color0
        : (api.visual("color") as string)
  const side = (v: number | null) => (v === null ? "–" : volumeText(v))
  const text = `${side(sell)} × ${side(buy)}`
  const cellWidth = Math.max(cellRight - cellLeft, 1)
  const fontSize = Math.min(11, Math.max(8, height * 0.7))
  // Text that does not fit is left out; the tooltip has the values.
  const fits = height >= 10 && text.length * fontSize * 0.6 <= cellWidth - 4
  return {
    type: "rect",
    shape: {
      x: cellLeft,
      y: top + 0.5,
      width: cellWidth,
      height: Math.max(height - 1, 1),
      r: 1,
    },
    style: {
      fill,
      ...(poc
        ? {
            stroke: payload.borderColor ?? payload.label?.color,
            lineWidth: 1.5,
          }
        : {}),
    },
    textContent: {
      type: "text",
      style: {
        text: fits ? text : "",
        fontSize,
        ...(payload.label?.color ? { fill: payload.label.color } : {}),
      },
    },
    textConfig: { position: "inside" },
  }
}

echarts.registerCustomSeries("footprint", footprintRenderItem)

// Pair with `echarts-for-react/lib/core` — importing the default wrapper
// instead would pull the full echarts catalog and undo the tree-shaking.
export { echarts }
