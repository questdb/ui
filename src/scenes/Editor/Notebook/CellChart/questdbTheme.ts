import type { ColorShape } from "../../../../types"
import { withAlpha } from "../../../../theme"

// The console's ECharts theme. It is the base for preset charts, visuals and
// agent-written options, so it styles every chart type ECharts has, not only
// the presets: flat surfaces, hairline grid lines, no axis lines on value
// axes, quiet labels, tabular figures, and labels that stay readable on any
// fill (a halo in the surface colour).

// Canvas 2D font shorthand silently rejects the whole string if any token is
// malformed and falls back to "10px sans-serif". Keep to quoted or standard
// family names only.
export const CHART_FONT = '"Open Sans", Helvetica, Arial, sans-serif'

export const createQuestdbTheme = (colors: ColorShape) => {
  const seriesPalette = [
    colors.chartSeries1,
    colors.chartSeries2,
    colors.chartSeries3,
    colors.chartSeries4,
    colors.chartSeries5,
    colors.chartSeries6,
    colors.chartSeries7,
    colors.chartSeries8,
  ]

  const text = colors.contentPrimary
  const quiet = colors.contentSecondary
  const surface = colors.surfaceInset
  const grid = colors.dataGrid
  const halo = { textBorderColor: surface, textBorderWidth: 2 }
  const label = { color: text, fontSize: 11, ...halo }
  // Labels drawn on a filled shape (heatmap cells, treemap tiles, funnel
  // steps): no halo, which smears on a coloured fill. Fills stay light enough
  // (tones at partial alpha) for the primary text colour to read on them.
  const onFill = {
    color: text,
    fontSize: 12,
    fontWeight: 600,
    textBorderWidth: 0,
  }

  const axis = {
    axisLine: { show: true, lineStyle: { color: colors.borderDefault } },
    axisTick: { show: false, lineStyle: { color: colors.borderDefault } },
    axisLabel: { color: quiet, fontSize: 11, hideOverlap: true },
    splitLine: { lineStyle: { color: grid, type: [3, 3] } },
    splitArea: {
      show: false,
      areaStyle: { color: [colors.transparent, colors.dataArea] },
    },
    nameTextStyle: { color: quiet, fontSize: 11 },
    fontSize: undefined,
  }
  const valueAxis = { ...axis, axisLine: { show: false } }

  return {
    color: seriesPalette,
    backgroundColor: surface,
    textStyle: { color: text, fontFamily: CHART_FONT, fontSize: 12 },
    title: {
      textStyle: { color: text, fontSize: 13, fontWeight: 600 },
      subtextStyle: { color: quiet, fontSize: 11 },
    },
    legend: {
      icon: "roundRect",
      itemWidth: 10,
      itemHeight: 10,
      itemGap: 14,
      textStyle: { color: quiet, fontSize: 11 },
      inactiveColor: colors.contentMuted,
      pageTextStyle: { color: quiet, fontSize: 11 },
      pageIconColor: quiet,
      pageIconInactiveColor: colors.contentMuted,
    },
    tooltip: {
      appendToBody: true,
      backgroundColor: colors.surfaceRaised,
      borderColor: colors.borderDefault,
      borderWidth: 1,
      padding: [8, 10],
      extraCssText: `border-radius: 6px; box-shadow: 0 6px 20px ${colors.shadowMedium}; font-variant-numeric: tabular-nums;`,
      textStyle: { color: text, fontSize: 12, fontFamily: CHART_FONT },
      axisPointer: {
        lineStyle: { color: colors.contentMuted, type: [3, 3] },
        crossStyle: { color: colors.contentMuted, type: [3, 3] },
        shadowStyle: { color: withAlpha(colors.contentMuted, 0.08) },
        label: {
          backgroundColor: colors.contentPrimary,
          color: surface,
          fontSize: 11,
          padding: [3, 6],
          borderRadius: 3,
        },
      },
    },
    categoryAxis: axis,
    valueAxis,
    timeAxis: axis,
    logAxis: valueAxis,
    line: {
      itemStyle: { borderWidth: 0 },
      lineStyle: { width: 1.5 },
      showSymbol: false,
      symbol: "circle",
      symbolSize: 6,
      smooth: false,
      textStyle: { fontSize: 12 },
    },
    bar: {
      barMaxWidth: 28,
      itemStyle: { barBorderWidth: 0, barBorderColor: colors.borderDefault },
      label,
    },
    pie: {
      itemStyle: { borderColor: surface, borderWidth: 2 },
      label: { color: quiet, fontSize: 11 },
      labelLine: { lineStyle: { color: colors.borderStrong } },
    },
    scatter: { itemStyle: { borderWidth: 0 } },
    candlestick: {
      itemStyle: {
        color: colors.chartUp,
        color0: colors.chartDown,
        borderColor: colors.chartUp,
        borderColor0: colors.chartDown,
        borderWidth: 1,
      },
    },
    boxplot: {
      itemStyle: { color: withAlpha(seriesPalette[0], 0.15), borderWidth: 1.5 },
    },
    heatmap: {
      itemStyle: { borderColor: surface, borderWidth: 2, borderRadius: 3 },
      label: onFill,
      emphasis: {
        itemStyle: { borderColor: text, borderWidth: 1 },
      },
    },
    gauge: {
      title: { color: quiet, fontSize: 12 },
      detail: { color: text, fontWeight: 600 },
      axisLabel: { color: quiet, fontSize: 11 },
      axisLine: { lineStyle: { color: [[1, colors.borderDefault]] } },
      splitLine: { lineStyle: { color: colors.borderStrong } },
      axisTick: { lineStyle: { color: colors.borderDefault } },
      anchor: { itemStyle: { color: text } },
    },
    radar: {
      axisName: { color: quiet, fontSize: 11 },
      axisLine: { lineStyle: { color: grid } },
      splitLine: { lineStyle: { color: grid } },
      splitArea: { areaStyle: { color: [colors.transparent] } },
      symbolSize: 4,
      lineStyle: { width: 1.5 },
    },
    funnel: {
      gap: 2,
      itemStyle: { borderColor: surface, borderWidth: 0, borderRadius: 4 },
      label: { color: text, fontSize: 12 },
      labelLine: { lineStyle: { color: colors.borderStrong } },
    },
    treemap: {
      breadcrumb: { show: false },
      itemStyle: { borderColor: surface, borderWidth: 1, gapWidth: 2 },
      label: onFill,
      upperLabel: { color: quiet, fontSize: 11 },
    },
    sunburst: {
      itemStyle: { borderColor: surface, borderWidth: 2 },
      label: { ...onFill, fontSize: 11 },
    },
    sankey: {
      label: { color: text, fontSize: 11, ...halo },
      itemStyle: { borderWidth: 0 },
      lineStyle: { color: "gradient", opacity: 0.25, curveness: 0.5 },
    },
    graph: {
      label: { color: text, fontSize: 11, ...halo },
      lineStyle: { color: colors.borderStrong, opacity: 0.7 },
      itemStyle: { borderColor: surface, borderWidth: 1.5 },
    },
    chord: {
      label: { color: quiet, fontSize: 11 },
      itemStyle: { borderColor: surface, borderWidth: 1 },
      lineStyle: { opacity: 0.35 },
    },
    themeRiver: { label: { color: quiet, fontSize: 11 } },
    pictorialBar: { label: { color: quiet, fontSize: 11 } },
    calendar: {
      itemStyle: {
        color: colors.transparent,
        borderColor: surface,
        borderWidth: 3,
      },
      splitLine: { show: false },
      dayLabel: { color: quiet, fontSize: 10 },
      monthLabel: { color: quiet, fontSize: 11 },
      yearLabel: { color: quiet, fontSize: 11 },
    },
    parallel: {},
    parallelAxis: {
      ...valueAxis,
      axisLine: { show: true, lineStyle: { color: colors.borderStrong } },
      nameTextStyle: { color: quiet, fontSize: 11 },
    },
    map: {
      itemStyle: {
        areaColor: colors.surfaceRaised,
        borderColor: colors.borderDefault,
        borderWidth: 0.6,
      },
      label: { color: quiet, fontSize: 10 },
      emphasis: {
        itemStyle: { areaColor: colors.interactionHover },
        label: { color: text },
      },
    },
    geo: {
      itemStyle: {
        areaColor: colors.surfaceRaised,
        borderColor: colors.borderDefault,
        borderWidth: 0.6,
      },
      label: { color: quiet, fontSize: 10 },
      emphasis: {
        itemStyle: { areaColor: colors.interactionHover },
        label: { color: text },
      },
    },
    visualMap: {
      textStyle: { color: quiet, fontSize: 11 },
      itemWidth: 10,
      itemHeight: 100,
      inRange: { color: [withAlpha(seriesPalette[0], 0.12), seriesPalette[0]] },
    },
    markLine: {
      lineStyle: { color: colors.contentMuted, type: [4, 3] },
      label: { color: quiet, fontSize: 11 },
    },
    dataZoom: {
      backgroundColor: colors.transparent,
      dataBackgroundColor: colors.borderDefault,
      fillerColor: colors.interactionAccentActive,
      handleColor: colors.contentMuted,
      handleSize: "100%",
      textStyle: { color: quiet, fontSize: 11 },
      borderColor: colors.borderDefault,
    },
    toolbox: {
      iconStyle: { borderColor: quiet },
      emphasis: { iconStyle: { borderColor: text } },
    },
  }
}
