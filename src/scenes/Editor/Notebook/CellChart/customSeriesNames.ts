// The custom series the console ships (see echartsSetup), by name. Kept apart
// from ECharts so code that only checks names does not load the charts.

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
