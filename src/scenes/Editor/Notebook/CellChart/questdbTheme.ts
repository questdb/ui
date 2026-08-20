import type { ColorShape } from "../../../../types"

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

  const axis = {
    axisLine: { lineStyle: { color: colors.borderDefault } },
    axisTick: { lineStyle: { color: colors.borderDefault } },
    axisLabel: { color: colors.contentSecondary, fontSize: 12 },
    splitLine: { lineStyle: { color: colors.dataGrid } },
    splitArea: {
      areaStyle: { color: [colors.transparent, colors.dataArea] },
    },
    nameTextStyle: { color: colors.contentSecondary, fontSize: 12 },
    fontSize: undefined,
  }

  return {
    color: seriesPalette,
    backgroundColor: colors.surfaceInset,
    // Canvas 2D font shorthand silently rejects the whole string if any token is malformed
    // (CSS keywords, leading-hyphen families, unquoted hyphenated names) and falls back to
    // "10px sans-serif", which then eats every fontSize. Keep to standard family names only.
    textStyle: {
      color: colors.contentPrimary,
      fontFamily: "Helvetica, Arial, sans-serif",
      fontSize: 12,
    },
    legend: {
      textStyle: { color: colors.contentSecondary, fontSize: 12 },
      inactiveColor: colors.contentMuted,
      pageTextStyle: { color: colors.contentSecondary, fontSize: 12 },
      pageIconColor: colors.contentSecondary,
      pageIconInactiveColor: colors.contentMuted,
    },
    tooltip: {
      appendToBody: true,
      backgroundColor: colors.surfaceRaised,
      borderColor: colors.borderDefault,
      borderWidth: 1,
      textStyle: { color: colors.contentPrimary, fontSize: 12 },
      axisPointer: {
        lineStyle: { color: colors.contentMuted },
        crossStyle: { color: colors.contentMuted },
        label: {
          backgroundColor: colors.borderDefault,
          color: colors.contentPrimary,
        },
      },
    },
    categoryAxis: axis,
    valueAxis: axis,
    timeAxis: axis,
    logAxis: axis,
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
      itemStyle: { barBorderWidth: 0, barBorderColor: colors.borderDefault },
    },
    pie: {
      itemStyle: { borderColor: colors.surfaceInset, borderWidth: 2 },
      label: { color: colors.contentPrimary },
      labelLine: { lineStyle: { color: colors.contentMuted } },
    },
    scatter: {
      itemStyle: { borderWidth: 0 },
    },
    candlestick: {
      itemStyle: {
        color: colors.statusSuccess,
        color0: colors.statusDanger,
        borderColor: colors.dataPositive,
        borderColor0: colors.dataNegative,
        borderWidth: 1,
      },
    },
    dataZoom: {
      backgroundColor: colors.transparent,
      dataBackgroundColor: colors.borderDefault,
      fillerColor: colors.interactionAccentActive,
      handleColor: colors.contentMuted,
      handleSize: "100%",
      textStyle: { color: colors.contentSecondary, fontSize: 12 },
      borderColor: colors.borderDefault,
    },
    toolbox: {
      iconStyle: { borderColor: colors.contentSecondary },
      emphasis: { iconStyle: { borderColor: colors.contentPrimary } },
    },
  }
}
