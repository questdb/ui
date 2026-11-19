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
import barRange from "@echarts-x/custom-bar-range"
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
  barRange,
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
  "lineRange",
  "stage",
  "violin",
  "contour",
  "segmentedDoughnut",
] as const

// Pair with `echarts-for-react/lib/core` — importing the default wrapper
// instead would pull the full echarts catalog and undo the tree-shaking.
export { echarts }
