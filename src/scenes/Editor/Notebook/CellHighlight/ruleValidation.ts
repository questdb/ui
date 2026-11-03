import type { ColumnDefinition } from "../../../../utils/questdb/types"
import {
  validateRuleFields,
  type BoundKind,
  type ColumnKind,
  type RuleErrors,
} from "../../../../components/ResultGrid/highlight"
import {
  conditionFitsKind,
  conditionOptionOf,
  targetKind,
  type DraftRule,
} from "./ruleDraft"

export {
  stepErrorKey,
  validateIdentity,
  type RuleErrors,
} from "../../../../components/ResultGrid/highlight"

const boundKindOf = (kind: ColumnKind | null): BoundKind =>
  kind === "numeric" || kind === "temporal" ? kind : "unknown"

const KIND_LABELS: Record<ColumnKind, string> = {
  numeric: "a numeric",
  temporal: "a timestamp",
  text: "a text",
  boolean: "a boolean",
  other: "this",
}

export const validateRule = (
  rule: DraftRule,
  columns: ColumnDefinition[],
): RuleErrors => {
  if (rule.kind === "unset") {
    return rule.target
      ? { condition: "Choose a condition" }
      : { column: "Choose a column" }
  }
  if (rule.kind === "newRow") return validateRuleFields(rule, "unknown")
  if (rule.target.kind === "column" && !rule.target.name.trim()) {
    return { column: "Choose a column" }
  }
  const kind = targetKind(rule.target, columns)
  if (!conditionFitsKind(conditionOptionOf(rule), kind)) {
    return { condition: `Not for ${KIND_LABELS[kind ?? "other"]} column` }
  }
  const errors = validateRuleFields(rule, boundKindOf(kind))
  if (
    kind === "temporal" &&
    rule.kind === "value" &&
    rule.condition.op === "between" &&
    rule.condition.fill.kind === "gradient"
  ) {
    return { fill: "Gradient needs a numeric column", ...errors }
  }
  return errors
}

export const validateRules = (
  rules: DraftRule[],
  columns: ColumnDefinition[],
): Map<string, RuleErrors> => {
  const result = new Map<string, RuleErrors>()
  for (const rule of rules) {
    const errors = validateRule(rule, columns)
    if (Object.keys(errors).length > 0) result.set(rule.id, errors)
  }
  return result
}
