import type { ColumnDefinition } from "../../../../utils/questdb/types"
import { compilePattern } from "../../../../components/ResultGrid/highlight/evaluateHighlights"
import { targetKind, type DraftConfig, type DraftRule } from "./ruleDraft"

// Field key → short message. Keys match the inputs in the rule editor; a
// step's key is stepErrorKey(step.id).
export type RuleErrors = Record<string, string>

export const stepErrorKey = (stepId: string) => `step:${stepId}`

const EMPTY = "Should not be empty"

const isBlank = (value: number | string) =>
  typeof value === "string" && value.trim() === ""

const isNumber = (value: number | string) =>
  typeof value === "number"
    ? Number.isFinite(value)
    : value.trim() !== "" && Number.isFinite(Number(value))

const isTimestamp = (value: number | string) =>
  !Number.isNaN(
    Date.parse(
      String(value)
        .trim()
        .replace(/^['"]|['"]$/g, ""),
    ),
  )

type BoundKind = "numeric" | "temporal" | "unknown"

// A column's type is known only once a result has shown it; until then, or
// for a text column, any text is accepted and the engine decides per grid.
const boundError = (value: number | string, kind: BoundKind): string | null => {
  if (isBlank(value)) return EMPTY
  if (kind === "numeric") return isNumber(value) ? null : "Should be a number"
  if (kind === "temporal") {
    return isTimestamp(value) ? null : "Should be a timestamp"
  }
  return null
}

const asNumber = (value: number | string, kind: BoundKind): number | null => {
  if (kind === "numeric") return Number(value)
  if (kind === "temporal") return Date.parse(String(value).trim())
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export const validateRule = (
  rule: DraftRule,
  columns: ColumnDefinition[],
): RuleErrors => {
  const errors: RuleErrors = {}
  if (rule.kind === "unset") {
    if (!rule.target) errors.column = "Choose a column"
    else errors.condition = "Choose a condition"
    return errors
  }
  if (rule.target.kind === "column" && !rule.target.name.trim()) {
    errors.column = "Choose a column"
  }
  const kind = targetKind(rule.target, columns)
  const ordered: BoundKind =
    kind === "numeric" || kind === "temporal" ? kind : "unknown"

  switch (rule.kind) {
    case "previous": {
      const condition = rule.condition
      if (condition.op !== "changedBy") break
      if (!Number.isFinite(condition.threshold)) {
        errors.threshold = "Should be a number"
      } else if (condition.threshold < 0) {
        errors.threshold = "Should be non-negative"
      }
      break
    }
    case "value": {
      const condition = rule.condition
      switch (condition.op) {
        case "isNull":
          break
        case "contains":
          if (isBlank(condition.text)) errors.text = EMPTY
          break
        case "matches":
          if (isBlank(condition.pattern)) errors.pattern = EMPTY
          else if (compilePattern(condition.pattern) === null) {
            errors.pattern = "Invalid expression"
          }
          break
        case "eq": {
          if (kind !== "numeric" && kind !== "temporal") break
          const error = boundError(condition.value, kind)
          if (error) errors.value = error
          break
        }
        case "gt":
        case "gte":
        case "lt":
        case "lte": {
          const error = boundError(condition.value, ordered)
          if (error) errors.value = error
          break
        }
        case "between": {
          const from = boundError(condition.from, ordered)
          const to = boundError(condition.to, ordered)
          if (from) errors.from = from
          if (to) errors.to = to
          if (from || to) break
          const low = asNumber(condition.from, ordered)
          const high = asNumber(condition.to, ordered)
          if (low === null || high === null) break
          if (condition.fill.kind === "gradient" && high <= low) {
            errors.to = "Should be above From"
          } else if (high < low) {
            errors.to = "Should be at least From"
          }
          break
        }
      }
      break
    }
    case "steps": {
      if (rule.steps.length === 0) errors.steps = "Add at least one step"
      const seen = new Set<number>()
      for (const step of rule.steps) {
        if (!Number.isFinite(step.below)) {
          errors[stepErrorKey(step.id)] = "Should be a number"
        } else if (seen.has(step.below)) {
          errors[stepErrorKey(step.id)] = "Duplicate bound"
        }
        seen.add(step.below)
      }
      break
    }
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
  draft.rules.some((rule) => rule.kind === "previous")
    ? "Needed for comparison rules"
    : null
