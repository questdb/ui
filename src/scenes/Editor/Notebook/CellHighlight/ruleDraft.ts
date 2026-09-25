import type { ColumnDefinition } from "../../../../utils/questdb/types"
import {
  columnKindOf,
  createRuleId,
  DEFAULT_REMAINDER_COLOR,
  DEFAULT_RULE_COLOR,
  defaultDisplayFor,
  type ColumnKind,
  type ColumnRange,
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
  | "value.gte"
  | "value.lt"
  | "value.lte"
  | "value.eq"
  | "value.between"
  | "value.isNull"
  | "value.contains"
  | "value.matches"
  | "steps"

export type ConditionGroup = "previous" | "value"

type ConditionDescriptor = {
  value: ConditionOption
  label: string
  group: ConditionGroup
}

export const conditionDescriptors: ConditionDescriptor[] = [
  { value: "prev.gt", label: "> previous", group: "previous" },
  { value: "prev.lt", label: "< previous", group: "previous" },
  { value: "prev.changed", label: "changed", group: "previous" },
  {
    value: "prev.changedBy",
    label: "changed by at least",
    group: "previous",
  },
  { value: "value.gt", label: "> value", group: "value" },
  { value: "value.gte", label: "≥ value", group: "value" },
  { value: "value.lt", label: "< value", group: "value" },
  { value: "value.lte", label: "≤ value", group: "value" },
  { value: "value.eq", label: "= value", group: "value" },
  { value: "value.between", label: "between", group: "value" },
  { value: "value.isNull", label: "is null", group: "value" },
  {
    value: "value.contains",
    label: "contains",
    group: "value",
  },
  {
    value: "value.matches",
    label: "matches regex",
    group: "value",
  },
  { value: "steps", label: "steps", group: "value" },
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

// Every condition is offered for every column: a rule that cannot apply to a
// grid's column type is a no-op there, decided at evaluation.
export const conditionOptions = (): ConditionDescriptor[] =>
  conditionDescriptors

export const conditionOptionOf = (rule: HighlightRule): ConditionOption => {
  switch (rule.kind) {
    case "previous":
      return `prev.${rule.condition.op}`
    case "value":
      return `value.${rule.condition.op}`
    case "steps":
      return "steps"
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
    appliesTo: rule.appliesTo,
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
    case "value.gte":
    case "value.lt":
    case "value.lte":
    case "value.eq": {
      const op = option.slice("value.".length) as
        | "gt"
        | "gte"
        | "lt"
        | "lte"
        | "eq"
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
        condition: { op: "between", from: 0, to: 0, fill: { kind: "solid" } },
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
  }
}

// A between range starts at the column's current span, so a scale begins at
// the data instead of at 0…0.
export const withSeededRange = (
  rule: HighlightRule,
  range: ColumnRange | null,
): HighlightRule =>
  range && rule.kind === "value" && rule.condition.op === "between"
    ? {
        ...rule,
        condition: { ...rule.condition, from: range.from, to: range.to },
      }
    : rule

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
