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

/** Custom series names the console ships, usable from any chart option. */
export const BUILTIN_CUSTOM_SERIES = [
  "barRange",
  "areaRange",
  "lineRange",
  "stage",
  "violin",
  "contour",
  "segmentedDoughnut",
] as const

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
    itemPayload?: { opacity?: number }
  }
  const count = p.dataInsideLength
  // dataIndexInside counts the rows a zoom leaves in view, like count.
  if (p.dataIndexInside !== count - 1) return { type: "group", children: [] }
  const [xDim] = p.encode.x
  const [lowDim, highDim] = p.encode.y
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
    children: segments.map((points) => ({
      type: "polygon",
      shape: { points },
      style: {
        fill: api.visual("color") as string,
        opacity: p.itemPayload?.opacity ?? 0.2,
      },
      silent: true,
    })),
  }
}

echarts.registerCustomSeries("areaRange", areaRangeRenderItem)

// Pair with `echarts-for-react/lib/core` — importing the default wrapper
// instead would pull the full echarts catalog and undo the tree-shaking.
export { echarts }
