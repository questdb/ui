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
// decides per cell, a row rule counting for each cell of its row. Gradients
// stay per cell: their alpha is the cell's own magnitude.
export type HighlightAppliesTo = "cell" | "row"

export type RuleTarget =
  | { kind: "column"; name: string }
  | { kind: "allNumeric" }

export type ChangeUnit = "absolute" | "percent"

export type PreviousCondition =
  | { op: "gt" | "lt" | "changed" }
  | { op: "changedBy"; threshold: number; unit: ChangeUnit }

export type ValueCondition =
  | { op: "gt" | "lt" | "eq"; value: number | string }
  | { op: "between"; from: number | string; to: number | string }
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
}

export type PreviousRule = RuleBase & {
  kind: "previous"
  appliesTo: HighlightAppliesTo
  condition: PreviousCondition
  color: HighlightColorToken
}

export type ValueRule = RuleBase & {
  kind: "value"
  appliesTo: HighlightAppliesTo
  condition: ValueCondition
  color: HighlightColorToken
}

export type StepsRule = RuleBase & {
  kind: "steps"
  appliesTo: HighlightAppliesTo
  steps: HighlightStep[]
  remainderColor: HighlightColorToken
}

export type GradientRule = RuleBase & {
  kind: "gradient"
  max: number | "auto"
  negativeColor: HighlightColorToken
  positiveColor: HighlightColorToken
}

export type HighlightRule = PreviousRule | ValueRule | StepsRule | GradientRule

export type CellOrRowRule = Exclude<HighlightRule, GradientRule>

export const canApplyToRow = (rule: HighlightRule): rule is CellOrRowRule =>
  rule.kind !== "gradient"

export const ruleAppliesTo = (rule: HighlightRule): HighlightAppliesTo =>
  canApplyToRow(rule) ? rule.appliesTo : "cell"

export type HighlightConfig = {
  identityColumns: string[]
  rules: HighlightRule[]
}

export type CellHighlight = {
  color: HighlightColorToken
  alpha: number
  display: HighlightDisplay
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
