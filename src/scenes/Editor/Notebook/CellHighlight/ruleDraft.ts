import type { ColumnDefinition } from "../../../../utils/questdb/types"
import {
  columnKindOf,
  createRuleId,
  DEFAULT_BASE_COLOR,
  DEFAULT_RULE_COLOR,
  defaultDisplayFor,
  type ColumnKind,
  type HighlightColorToken,
  type HighlightRule,
  type PreviousRule,
  type RuleTarget,
} from "../../../../components/ResultGrid/highlight"

export type ConditionOption =
  | "prev.gt"
  | "prev.lt"
  | "prev.changed"
  | "newRow"
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
  { value: "newRow", label: "new row", group: "previous" },
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

// null until a result has shown the column, or for a column no result has.
export const targetKind = (
  target: RuleTarget,
  columns: ColumnDefinition[],
): ColumnKind | null => {
  if (target.kind === "allNumeric") return "numeric"
  const name = target.name
  const column = columns.find((candidate) => candidate.name === name)
  return column ? columnKindOf(column) : null
}

const ORDERED: ConditionOption[] = [
  "prev.gt",
  "prev.lt",
  "value.gt",
  "value.gte",
  "value.lt",
  "value.lte",
  "value.between",
]

const conditionOptionsByKind: Record<ColumnKind, ConditionOption[]> = {
  numeric: [
    "prev.changed",
    "newRow",
    "prev.changedBy",
    ...ORDERED,
    "value.eq",
    "value.isNull",
    "steps",
  ],
  temporal: ["prev.changed", "newRow", ...ORDERED, "value.eq", "value.isNull"],
  text: [
    "prev.changed",
    "newRow",
    "value.eq",
    "value.isNull",
    "value.contains",
    "value.matches",
  ],
  boolean: ["prev.changed", "newRow", "value.eq", "value.isNull"],
  other: ["prev.changed", "newRow", "value.isNull"],
}

// A column of unknown kind takes every condition; once a result shows the
// kind, only the conditions that can match it are offered. A rule saved
// with another condition keeps it listed until it is changed.
export const conditionOptions = (
  kind: ColumnKind | null,
  current: ConditionOption | null,
): ConditionDescriptor[] => {
  if (kind === null) return conditionDescriptors
  const allowed = new Set(conditionOptionsByKind[kind])
  if (current !== null) allowed.add(current)
  return conditionDescriptors.filter((descriptor) =>
    allowed.has(descriptor.value),
  )
}

export const conditionFitsKind = (
  option: ConditionOption,
  kind: ColumnKind | null,
): boolean => kind === null || conditionOptionsByKind[kind].includes(option)

export const isPatternRule = (rule: DraftRule): boolean =>
  rule.kind === "value" && rule.condition.op === "matches"

export const conditionOptionOf = (rule: HighlightRule): ConditionOption => {
  switch (rule.kind) {
    case "previous":
      return `prev.${rule.condition.op}`
    case "value":
      return `value.${rule.condition.op}`
    case "steps":
      return "steps"
    case "newRow":
      return "newRow"
  }
}

// A rule can start from a condition alone; a missing column is flagged on
// Save, and a new-row rule never needs one.
export const createRule = (
  id: string,
  target: RuleTarget | null,
  option: ConditionOption,
): HighlightRule =>
  withConditionOption(
    {
      id,
      enabled: true,
      target: target ?? { kind: "column", name: "" },
      display: "always",
      kind: "value",
      appliesTo: "cell",
      condition: { op: "gt", value: "" },
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
    target:
      rule.kind === "newRow"
        ? { kind: "column" as const, name: "" }
        : rule.target,
    appliesTo: rule.kind === "newRow" ? "cell" : rule.appliesTo,
  }
  const carriedColor = rule.kind === "steps" ? DEFAULT_RULE_COLOR : rule.color
  switch (option) {
    case "newRow":
      return {
        id: rule.id,
        enabled: rule.enabled,
        kind: "newRow",
        display: defaultDisplayFor("newRow"),
        color: carriedColor,
      }
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
        condition: { op, value: "" },
        color: carriedColor,
      }
    }
    case "value.between":
      return {
        ...base,
        kind: "value",
        display: defaultDisplayFor("value"),
        condition: {
          op: "between",
          from: null,
          to: null,
          fill: { kind: "solid" },
        },
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
        steps: [{ id: createRuleId(), from: 0, color: DEFAULT_RULE_COLOR }],
        baseColor: DEFAULT_BASE_COLOR,
      }
  }
}

// A gradient scales numbers only. A rule moved onto a column of another
// kind keeps its range as a solid fill.
export const withTarget = (
  rule: Exclude<DraftRule, { kind: "newRow" }>,
  target: RuleTarget,
  columns: ColumnDefinition[],
): DraftRule => {
  const moved = { ...rule, target }
  const kind = targetKind(target, columns)
  if (
    kind === null ||
    kind === "numeric" ||
    moved.kind !== "value" ||
    moved.condition.op !== "between" ||
    moved.condition.fill.kind !== "gradient"
  ) {
    return moved
  }
  return {
    ...moved,
    condition: { ...moved.condition, fill: { kind: "solid" } },
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

export const ruleTargetOf = (rule: DraftRule): RuleTarget | null =>
  rule.kind === "newRow" ? null : rule.target

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
