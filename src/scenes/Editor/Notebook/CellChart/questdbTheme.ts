const FOREGROUND = "#f8f8f2"
const GRAY2 = "#bbbbbb"
const COMMENT = "#6272a4"
const SELECTION = "#44475a"
const SPLIT_LINE = "rgba(68, 71, 90, 0.4)"
const BACKGROUND_DARKER = "#22222c"

const SERIES_PALETTE = [
  "#8be9fd",
  "#d14671",
  "#ffb86c",
  "#bd93f9",
  "#f1fa8c",
  "#ff79c6",
  "#50fa7b",
  "#ff5555",
]

const UP_FILL = "#50fa7b"
const UP_BORDER = "#00aa3b"
const DOWN_FILL = "#ff5555"
const DOWN_BORDER = "#be2f5b"

const axis = {
  axisLine: { lineStyle: { color: SELECTION } },
  axisTick: { lineStyle: { color: SELECTION } },
  axisLabel: { color: GRAY2, fontSize: 12 },
  splitLine: { lineStyle: { color: SPLIT_LINE } },
  splitArea: {
    areaStyle: { color: ["transparent", "rgba(255,255,255,0.02)"] },
  },
  nameTextStyle: { color: GRAY2, fontSize: 12 },
  fontSize: undefined,
}

export const questdbTheme = {
  color: SERIES_PALETTE,
  backgroundColor: "#282a36",
  // Canvas 2D font shorthand silently rejects the whole string if any token is malformed
  // (CSS keywords, leading-hyphen families, unquoted hyphenated names) and falls back to
  // "10px sans-serif", which then eats every fontSize. Keep to standard family names only.
  textStyle: {
    color: FOREGROUND,
    fontFamily: "Helvetica, Arial, sans-serif",
    fontSize: 12,
  },
  legend: {
    textStyle: { color: GRAY2, fontSize: 12 },
    inactiveColor: COMMENT,
    pageTextStyle: { color: GRAY2, fontSize: 12 },
    pageIconColor: GRAY2,
    pageIconInactiveColor: COMMENT,
  },
  tooltip: {
    backgroundColor: BACKGROUND_DARKER,
    borderColor: SELECTION,
    borderWidth: 1,
    textStyle: { color: FOREGROUND, fontSize: 12 },
    axisPointer: {
      lineStyle: { color: COMMENT },
      crossStyle: { color: COMMENT },
      label: { backgroundColor: SELECTION, color: FOREGROUND },
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
    itemStyle: { barBorderWidth: 0, barBorderColor: SELECTION },
  },
  pie: {
    itemStyle: { borderColor: BACKGROUND_DARKER, borderWidth: 1 },
    label: { color: FOREGROUND },
    labelLine: { lineStyle: { color: COMMENT } },
  },
  scatter: {
    itemStyle: { borderWidth: 0 },
  },
  candlestick: {
    itemStyle: {
      color: UP_FILL,
      color0: DOWN_FILL,
      borderColor: UP_BORDER,
      borderColor0: DOWN_BORDER,
      borderWidth: 1,
    },
  },
  dataZoom: {
    backgroundColor: "transparent",
    dataBackgroundColor: SELECTION,
    fillerColor: "rgba(98, 114, 164, 0.2)",
    handleColor: COMMENT,
    handleSize: "100%",
    textStyle: { color: GRAY2, fontSize: 12 },
    borderColor: SELECTION,
  },
  toolbox: {
    iconStyle: { borderColor: GRAY2 },
    emphasis: { iconStyle: { borderColor: FOREGROUND } },
  },
}
