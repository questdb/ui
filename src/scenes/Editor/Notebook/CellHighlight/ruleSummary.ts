import type { HighlightColorToken } from "../../../../components/ResultGrid/highlight"
import type { DraftRule } from "./ruleDraft"

// Strings read like the SQL the user just wrote: single quotes.
const formatValue = (value: string | number) =>
  typeof value === "string" ? `'${value}'` : String(value)

export const ruleSummary = (rule: DraftRule): string => {
  const target =
    rule.target?.kind === "allNumeric"
      ? "All numeric columns"
      : rule.target?.name || "Choose a column"
  if (rule.kind === "unset")
    return rule.target ? `${target} · Choose a condition` : "New rule"
  switch (rule.kind) {
    case "previous": {
      const condition = rule.condition
      switch (condition.op) {
        case "gt":
          return `${target} increases`
        case "lt":
          return `${target} decreases`
        case "changed":
          return `${target} changes`
        case "changedBy":
          return `${target} changes by ≥ ${condition.threshold}${condition.unit === "percent" ? "%" : " (abs)"}`
      }
      break
    }
    case "value": {
      const condition = rule.condition
      switch (condition.op) {
        case "gt":
          return `${target} > ${formatValue(condition.value)}`
        case "gte":
          return `${target} ≥ ${formatValue(condition.value)}`
        case "lt":
          return `${target} < ${formatValue(condition.value)}`
        case "lte":
          return `${target} ≤ ${formatValue(condition.value)}`
        case "eq":
          return `${target} = ${formatValue(condition.value)}`
        case "between":
          return `${target} between ${formatValue(condition.from)} and ${formatValue(condition.to)}`
        case "isNull":
          return `${target} is null`
        case "contains":
          return `${target} contains ${formatValue(condition.text)}`
        case "matches":
          return `${target} matches ${formatValue(condition.pattern)}`
      }
      break
    }
    case "steps":
      return `${target} · ${rule.steps.length} color ${rule.steps.length === 1 ? "step" : "steps"}`
  }
}

export const ruleColors = (rule: DraftRule): HighlightColorToken[] => {
  switch (rule.kind) {
    case "unset":
      return []
    case "previous":
      return [rule.color]
    case "value":
      return rule.condition.op === "between" &&
        rule.condition.fill.kind === "gradient"
        ? [rule.color, rule.condition.fill.highColor]
        : [rule.color]
    case "steps":
      return [
        ...new Set([
          ...rule.steps.map((step) => step.color),
          rule.remainderColor,
        ]),
      ]
  }
}

// Shown after the swatches, where the colors are, not in the title.
export const ruleFillLabel = (rule: DraftRule): string | null =>
  rule.kind === "value" &&
  rule.condition.op === "between" &&
  rule.condition.fill.kind === "gradient"
    ? "gradient"
    : null

export const ruleDescription = (rule: DraftRule): string => {
  if (rule.kind === "unset")
    return "Choose a column and condition to finish this rule"
  const display = rule.display === "temporary" ? "Flash" : "Permanent"
  return rule.appliesTo === "row" ? `${display} · Row` : display
}
