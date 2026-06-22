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
} from "echarts/components"
import { CanvasRenderer } from "echarts/renderers"
import { questdbTheme } from "./questdbTheme"

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
  CanvasRenderer,
])

export const QUESTDB_THEME = "questdb"
echarts.registerTheme(QUESTDB_THEME, questdbTheme)

// Pair with `echarts-for-react/lib/core` — importing the default wrapper
// instead would pull the full echarts catalog and undo the tree-shaking.
export { echarts }
