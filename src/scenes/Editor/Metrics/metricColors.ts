import { darkColors, lightColors } from "../../../theme"

export const metricColorTokens = [
  "dataSeries1",
  "dataSeries2",
  "dataSeries3",
  "dataSeries4",
  "dataSeries5",
  "dataSeries6",
  "dataSeries7",
  "dataSeries8",
  "dataSeries9",
  "dataSeries10",
] as const

export type MetricColorToken = (typeof metricColorTokens)[number]

export const DEFAULT_METRIC_COLOR_TOKEN: MetricColorToken = metricColorTokens[0]

const isMetricColorToken = (value: string): value is MetricColorToken =>
  metricColorTokens.includes(value as MetricColorToken)

const hexToToken = new Map<string, MetricColorToken>()
for (const palette of [darkColors, lightColors]) {
  metricColorTokens.forEach((token) => {
    hexToToken.set(palette[token].toLowerCase(), token)
  })
}

// Metrics used to persist a resolved hex. Older buffers therefore still hold a
// palette value rather than a token, and both palettes are checked because the
// stored hex depends on the theme that was active when the color was picked.
export const toMetricColorToken = (stored: string): MetricColorToken =>
  isMetricColorToken(stored)
    ? stored
    : (hexToToken.get(stored.trim().toLowerCase()) ??
      DEFAULT_METRIC_COLOR_TOKEN)

export const getTokenForNewMetric = (
  usedTokens: MetricColorToken[],
  lastToken: MetricColorToken,
): MetricColorToken => {
  const candidates = metricColorTokens.filter((token) => token !== lastToken)
  const unused = candidates.filter((token) => !usedTokens.includes(token))
  const pool = unused.length > 0 ? unused : candidates
  return pool[Math.floor(Math.random() * pool.length)]
}
