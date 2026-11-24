import type { ColumnFormats } from "../../../../utils/formats/columnFormat"
import type { QueryTab } from "../DrawCanvas/drawCanvasUtils"
import { drawsAlone, thresholdSource } from "./buildEchartsOption"
import { groupColumns } from "./inferChartConfig"
import type { ChartConfig, ChartType, QueryChart } from "./chartTypes"

const LYING_TYPES: ChartType[] = ["bar", "stackedBar", "rangeBar"]

const asDrawn = (q: QueryChart, tab: QueryTab) => ({
  type: q.type,
  yColumns: q.yColumns,
  roles: (q.band ?? q.range) as Record<string, string> | undefined,
  columns: tab.columns,
  axis: q.axis ?? ("left" as const),
  percentStack: q.percentStack,
})

/**
 * Which chart-wide options apply to a chart: bars can lie down when every
 * drawn query is a bar of some kind (a timeline already lies down), and
 * thresholds mark a y-axis, which pies, heatmaps, box plots and timelines
 * lack. `thresholdColumn` is the column whose format they come from.
 */
export const chartOptionsOffered = (
  chart: ChartConfig,
  tabs: QueryTab[],
  formats: ColumnFormats,
) => {
  // The queries the chart draws: enabled, on the first query's x-axis.
  const drawn = tabs.flatMap((t) => {
    const q = chart.queries[t.index]
    return t.compatible && q && q.enabled !== false && q.type !== "events"
      ? [asDrawn(q, t)]
      : []
  })
  const anchor = drawn[0]
  const anchorTab = tabs.find(
    (tab) => chart.queries[tab.index]?.type !== "events",
  )
  const numericX =
    anchorTab != null &&
    groupColumns(anchorTab.columns).numeric.some(
      ({ name }) => name === (chart.xColumn ?? anchorTab.xColumn),
    )
  // A pie draws alone only as the only query; next to others it is left out.
  const ownAxes =
    anchor !== undefined &&
    drawsAlone(anchor) &&
    (anchor.type !== "pie" || drawn.length === 1)
  return {
    lieDown:
      drawn.length > 0 &&
      !numericX &&
      !ownAxes &&
      drawn.every((q) => LYING_TYPES.includes(q.type)),
    thresholds: !ownAxes,
    thresholdColumn: thresholdSource(drawn, formats)?.column,
  }
}

/** The chart without options that do not apply to it, as it is saved. */
export const withoutUnofferedOptions = (
  chart: ChartConfig,
  tabs: QueryTab[],
): ChartConfig => {
  // No tab means we cannot assess availability from the current results.
  if (tabs.length === 0) return chart
  const offered = chartOptionsOffered(chart, tabs, {})
  const next = { ...chart }
  if (!offered.lieDown) delete next.horizontal
  if (!offered.thresholds) delete next.thresholds
  return next
}
