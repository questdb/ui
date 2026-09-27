import type { ColumnDefinition } from "../../../../utils/questdb/types"
import {
  validateRuleFields,
  type BoundKind,
  type RuleErrors,
} from "../../../../components/ResultGrid/highlight"
import { targetKind, type DraftConfig, type DraftRule } from "./ruleDraft"

export {
  stepErrorKey,
  type RuleErrors,
} from "../../../../components/ResultGrid/highlight"

const boundKindOf = (
  rule: DraftRule,
  columns: ColumnDefinition[],
): BoundKind => {
  if (rule.kind === "unset" || rule.kind === "newRow") return "unknown"
  const kind = targetKind(rule.target, columns)
  return kind === "numeric" || kind === "temporal" ? kind : "unknown"
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
  const errors = validateRuleFields(rule, boundKindOf(rule, columns))
  if (
    rule.kind !== "newRow" &&
    rule.target.kind === "column" &&
    !rule.target.name.trim()
  ) {
    return { column: "Choose a column", ...errors }
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

// Identity is needed only by rules that compare with the previous result.
export const validateIdentity = (draft: DraftConfig): string | null =>
  draft.identityColumns.length === 0 &&
  draft.rules.some((rule) => rule.kind === "previous" || rule.kind === "newRow")
    ? "Needed for comparison rules"
    : null
