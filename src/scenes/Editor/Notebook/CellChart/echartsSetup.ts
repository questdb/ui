import * as echarts from "echarts/core"
import {
  BarChart,
  LineChart,
  PieChart,
  ScatterChart,
  CandlestickChart,
} from "echarts/charts"
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  ToolboxComponent,
  TitleComponent,
  VisualMapComponent,
} from "echarts/components"
import { CanvasRenderer } from "echarts/renderers"

echarts.use([
  BarChart,
  LineChart,
  PieChart,
  ScatterChart,
  CandlestickChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  ToolboxComponent,
  TitleComponent,
  VisualMapComponent,
  CanvasRenderer,
])

// Pair with `echarts-for-react/lib/core` — importing the default wrapper
// instead would pull the full echarts catalog and undo the tree-shaking.
export { echarts }
