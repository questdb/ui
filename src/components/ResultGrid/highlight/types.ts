// Ten hues in palette order. Red and green are the semantic directional pair,
// so the chart palette's own red (dataSeries1) and green (dataSeries7) are
// not offered: one meaning per hue.
export const highlightHueTokens = {
  red: "dataNegative",
  teal: "dataSeries2",
  amber: "dataSeries3",
  lime: "dataSeries4",
  orange: "dataSeries5",
  purple: "dataSeries6",
  green: "dataPositive",
  pink: "dataSeries8",
  blue: "dataSeries9",
  olive: "dataSeries10",
} as const

export type HighlightHue = keyof typeof highlightHueTokens
export type HighlightColorToken = (typeof highlightHueTokens)[HighlightHue]

export const highlightHues = Object.keys(highlightHueTokens) as HighlightHue[]
export const highlightColorTokens = highlightHues.map(
  (hue) => highlightHueTokens[hue],
)

export const tokenOfHue = (hue: HighlightHue): HighlightColorToken =>
  highlightHueTokens[hue]

export const hueOfToken = (token: HighlightColorToken): HighlightHue =>
  highlightHues.find((hue) => highlightHueTokens[hue] === token) ?? "teal"

export const DEFAULT_RULE_COLOR: HighlightColorToken = "dataSeries2"
export const DEFAULT_REMAINDER_COLOR: HighlightColorToken = "dataSeries3"

export type HighlightDisplay = "temporary" | "always"

// Where a match paints: its own cell, or every cell of the row. List order
// decides per cell, a row rule counting for each cell of its row.
export type HighlightAppliesTo = "cell" | "row"

export type RuleTarget =
  | { kind: "column"; name: string }
  | { kind: "allNumeric" }

export type ChangeUnit = "absolute" | "percent"

export type PreviousCondition =
  | { op: "gt" | "lt" | "changed" }
  | { op: "changedBy"; threshold: number; unit: ChangeUnit }

// A between range is either matched (solid) or used as a scale: the rule
// color at `from`, `highColor` at `to`, mixed in between, clamped beyond.
export type BetweenFill =
  | { kind: "solid" }
  | { kind: "gradient"; highColor: HighlightColorToken }

export type ValueCondition =
  | { op: "gt" | "gte" | "lt" | "lte" | "eq"; value: number | string }
  | {
      op: "between"
      from: number | string
      to: number | string
      fill: BetweenFill
    }
  | { op: "isNull" }
  | { op: "contains"; text: string }
  | { op: "matches"; pattern: string }

export type HighlightStep = {
  id: string
  below: number
  color: HighlightColorToken
}

type RuleBase = {
  id: string
  enabled: boolean
  target: RuleTarget
  display: HighlightDisplay
  appliesTo: HighlightAppliesTo
}

export type PreviousRule = RuleBase & {
  kind: "previous"
  condition: PreviousCondition
  color: HighlightColorToken
}

export type ValueRule = RuleBase & {
  kind: "value"
  condition: ValueCondition
  color: HighlightColorToken
}

export type StepsRule = RuleBase & {
  kind: "steps"
  steps: HighlightStep[]
  remainderColor: HighlightColorToken
}

export type HighlightRule = PreviousRule | ValueRule | StepsRule

export type HighlightConfig = {
  identityColumns: string[]
  rules: HighlightRule[]
}

// `blend` mixes `color` toward another hue by `ratio` (0 = color, 1 = the
// other hue); only a gradient fill sets it.
export type CellHighlight = {
  color: HighlightColorToken
  alpha: number
  display: HighlightDisplay
  blend?: { color: HighlightColorToken; ratio: number }
}

export type CellDirection = "up" | "down"

export type HighlightLookup = {
  background: (row: number, col: number) => CellHighlight | undefined
  row: (row: number) => CellHighlight | undefined
  direction: (row: number, col: number) => CellDirection | undefined
  hasDirection: (col: number) => boolean
}

export type MatchStats = {
  total: number
  matched: number
  added: number
  ambiguous: number
}

export type HighlightEvaluation = {
  lookup: HighlightLookup
  stats: MatchStats | null
}

export const EMPTY_HIGHLIGHT_LOOKUP: HighlightLookup = {
  background: () => undefined,
  row: () => undefined,
  direction: () => undefined,
  hasDirection: () => false,
}

export const defaultDisplayFor = (
  kind: HighlightRule["kind"],
): HighlightDisplay => (kind === "previous" ? "temporary" : "always")
