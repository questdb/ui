import {
  buildEchartsOption,
  hasDuplicateHeatmapReadings,
} from "./buildEchartsOption"
import {
  incompleteHeatmap,
  HEATMAP_INCOMPLETE_MESSAGE,
  missingHeatmapX,
  missingHeatmapXMessage,
  type DrawResolution,
} from "../DrawCanvas/drawCanvasUtils"

// Shown on the chart, so it points to where the user fixes it.
export const HEATMAP_PLOT_CONFLICT_MESSAGE =
  "Heatmaps need a chart of their own. Include only one query in Chart settings."
export const HEATMAP_DUPLICATE_MESSAGE =
  "Multiple readings share a heatmap cell. Aggregate the query to one reading per X-axis and Rows combination (for example, with GROUP BY and avg)."

export const resolveChartPlot = ({ chart, renderQueries }: DrawResolution) => {
  const heatmaps = renderQueries.filter(({ type }) => type === "heatmap")
  if (heatmaps.length > 1)
    return { option: null, message: HEATMAP_PLOT_CONFLICT_MESSAGE }
  const heatmap = heatmaps[0]
  if (heatmap) {
    const { xColumn, columns } = heatmap
    if (xColumn != null && missingHeatmapX(columns, xColumn))
      return { option: null, message: missingHeatmapXMessage(xColumn) }
    if (incompleteHeatmap(heatmap))
      return { option: null, message: HEATMAP_INCOMPLETE_MESSAGE }
    if (hasDuplicateHeatmapReadings(heatmap))
      return { option: null, message: HEATMAP_DUPLICATE_MESSAGE }
    return {
      option: buildEchartsOption(chart, [heatmap]),
      message: renderQueries.length > 1 ? HEATMAP_PLOT_CONFLICT_MESSAGE : null,
    }
  }
  return {
    option: renderQueries.length
      ? buildEchartsOption(chart, renderQueries)
      : null,
    message: null,
  }
}
