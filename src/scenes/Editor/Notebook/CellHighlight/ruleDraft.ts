import type { ColumnDefinition } from "../../../../utils/questdb/types"
import {
  columnKindOf,
  createRuleId,
  DEFAULT_REMAINDER_COLOR,
  DEFAULT_RULE_COLOR,
  defaultDisplayFor,
  type ColumnKind,
  ruleAppliesTo,
  type HighlightColorToken,
  type HighlightRule,
  type PreviousRule,
  type RuleTarget,
} from "../../../../components/ResultGrid/highlight"

export type ConditionOption =
  | "prev.gt"
  | "prev.lt"
  | "prev.changed"
  | "prev.changedBy"
  | "value.gt"
  | "value.lt"
  | "value.eq"
  | "value.between"
  | "value.isNull"
  | "value.contains"
  | "value.matches"
  | "steps"
  | "gradient"

export type ConditionGroup = "previous" | "value" | "scale"

type ConditionDescriptor = {
  value: ConditionOption
  label: string
  group: ConditionGroup
  kinds: ColumnKind[]
}

const NUMERIC: ColumnKind[] = ["numeric"]
const ORDERED: ColumnKind[] = ["numeric", "temporal"]
const ANY: ColumnKind[] = ["numeric", "temporal", "text", "boolean", "other"]

export const conditionDescriptors: ConditionDescriptor[] = [
  { value: "prev.gt", label: "> previous", group: "previous", kinds: NUMERIC },
  { value: "prev.lt", label: "< previous", group: "previous", kinds: NUMERIC },
  { value: "prev.changed", label: "changed", group: "previous", kinds: ANY },
  {
    value: "prev.changedBy",
    label: "changed by more than",
    group: "previous",
    kinds: NUMERIC,
  },
  { value: "value.gt", label: "> value", group: "value", kinds: ORDERED },
  { value: "value.lt", label: "< value", group: "value", kinds: ORDERED },
  { value: "value.eq", label: "= value", group: "value", kinds: ANY },
  { value: "value.between", label: "between", group: "value", kinds: ORDERED },
  { value: "value.isNull", label: "is null", group: "value", kinds: ANY },
  {
    value: "value.contains",
    label: "contains",
    group: "value",
    kinds: ["text"],
  },
  {
    value: "value.matches",
    label: "matches regex",
    group: "value",
    kinds: ["text"],
  },
  { value: "steps", label: "steps", group: "value", kinds: NUMERIC },
  { value: "gradient", label: "gradient", group: "scale", kinds: NUMERIC },
]

export const ALL_NUMERIC_TARGET = "all:numeric"

export const targetToValue = (target: RuleTarget): string =>
  target.kind === "allNumeric" ? ALL_NUMERIC_TARGET : `col:${target.name}`

export const targetFromValue = (value: string): RuleTarget =>
  value === ALL_NUMERIC_TARGET
    ? { kind: "allNumeric" }
    : { kind: "column", name: value.slice("col:".length) }

export const targetKind = (
  target: RuleTarget,
  columns: ColumnDefinition[],
): ColumnKind => {
  if (target.kind === "allNumeric") return "numeric"
  const name = target.name
  const column = columns.find((candidate) => candidate.name === name)
  return column ? columnKindOf(column) : "other"
}

export const conditionOptionsFor = (kind: ColumnKind): ConditionDescriptor[] =>
  conditionDescriptors.filter((descriptor) => descriptor.kinds.includes(kind))

export const conditionOptionOf = (rule: HighlightRule): ConditionOption => {
  switch (rule.kind) {
    case "previous":
      return `prev.${rule.condition.op}`
    case "value":
      return `value.${rule.condition.op}`
    case "steps":
      return "steps"
    case "gradient":
      return "gradient"
  }
}

export const createRule = (
  id: string,
  target: RuleTarget,
  option: ConditionOption,
): HighlightRule =>
  withConditionOption(
    {
      id,
      enabled: true,
      target,
      display: "always",
      kind: "value",
      appliesTo: "cell",
      condition: { op: "gt", value: 0 },
      color: DEFAULT_RULE_COLOR,
    },
    option,
  )

const previousColorFor = (
  op: PreviousRule["condition"]["op"],
  carried: HighlightColorToken,
): HighlightColorToken =>
  op === "gt" ? "dataPositive" : op === "lt" ? "dataNegative" : carried

// Keeps identity, target, enabled state and applies-to; the display resets to the
// kind's default because a temporary flash only makes sense against the
// previous result.
export const withConditionOption = (
  rule: HighlightRule,
  option: ConditionOption,
): HighlightRule => {
  const base = {
    id: rule.id,
    enabled: rule.enabled,
    target: rule.target,
    appliesTo: ruleAppliesTo(rule),
  }
  const carriedColor =
    rule.kind === "previous" || rule.kind === "value"
      ? rule.color
      : DEFAULT_RULE_COLOR
  switch (option) {
    case "prev.gt":
    case "prev.lt":
    case "prev.changed": {
      const op = option.slice("prev.".length) as "gt" | "lt" | "changed"
      return {
        ...base,
        kind: "previous",
        display: defaultDisplayFor("previous"),
        condition: { op },
        color: previousColorFor(op, carriedColor),
      }
    }
    case "prev.changedBy":
      return {
        ...base,
        kind: "previous",
        display: defaultDisplayFor("previous"),
        condition: { op: "changedBy", threshold: 1, unit: "percent" },
        color: carriedColor,
      }
    case "value.gt":
    case "value.lt":
    case "value.eq": {
      const op = option.slice("value.".length) as "gt" | "lt" | "eq"
      return {
        ...base,
        kind: "value",
        display: defaultDisplayFor("value"),
        condition: { op, value: 0 },
        color: carriedColor,
      }
    }
    case "value.between":
      return {
        ...base,
        kind: "value",
        display: defaultDisplayFor("value"),
        condition: { op: "between", from: 0, to: 0 },
        color: carriedColor,
      }
    case "value.isNull":
      return {
        ...base,
        kind: "value",
        display: defaultDisplayFor("value"),
        condition: { op: "isNull" },
        color: carriedColor,
      }
    case "value.contains":
      return {
        ...base,
        kind: "value",
        display: defaultDisplayFor("value"),
        condition: { op: "contains", text: "" },
        color: carriedColor,
      }
    case "value.matches":
      return {
        ...base,
        kind: "value",
        display: defaultDisplayFor("value"),
        condition: { op: "matches", pattern: "" },
        color: carriedColor,
      }
    case "steps":
      return {
        ...base,
        kind: "steps",
        display: defaultDisplayFor("steps"),
        steps: [{ id: createRuleId(), below: 0, color: DEFAULT_RULE_COLOR }],
        remainderColor: DEFAULT_REMAINDER_COLOR,
      }
    case "gradient": {
      const { appliesTo: _cellOnly, ...cellOnly } = base
      return {
        ...cellOnly,
        kind: "gradient",
        display: defaultDisplayFor("gradient"),
        max: "auto",
        negativeColor: "dataNegative",
        positiveColor: "dataPositive",
      }
    }
  }
}

// A freshly added row: nothing chosen yet. It stays in the draft until a
// column and a condition are picked, and is dropped on save otherwise.
export type UnsetRule = {
  id: string
  enabled: true
  kind: "unset"
  target: RuleTarget | null
}

export type DraftRule = HighlightRule | UnsetRule

export type DraftConfig = {
  identityColumns: string[]
  rules: DraftRule[]
}

// What the drawer keeps while open: the edited config and which rule is
// expanded. Carried across a cell remount as one unit.
export type HighlightDraft = {
  config: DraftConfig
  expandedRuleId: string | null
}

export const createUnsetRule = (id: string): UnsetRule => ({
  id,
  enabled: true,
  kind: "unset",
  target: null,
})

export const isCompleteRule = (rule: DraftRule): rule is HighlightRule =>
  rule.kind !== "unset"

export type RuleMove = -1 | 1 | "top" | "bottom"

export const moveRule = <Rule>(
  rules: Rule[],
  index: number,
  move: RuleMove,
): Rule[] => {
  const to =
    move === "top" ? 0 : move === "bottom" ? rules.length - 1 : index + move
  if (to === index || to < 0 || to >= rules.length) return rules
  const next = [...rules]
  const [rule] = next.splice(index, 1)
  next.splice(to, 0, rule)
  return next
}
