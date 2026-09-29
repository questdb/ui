import { canonicalInstant, compareValues, type Comparable } from "./comparable"
import { compilePattern } from "./pattern"
import type { BetweenBound, HighlightRule } from "./types"

// Field key → short message. Keys match the inputs in the rule editor; a
// step's key is stepErrorKey(step.id). The drawer and the agent wire share
// these checks so a rule the agent sends fails exactly where the drawer would.
export type RuleErrors = Record<string, string>

export const stepErrorKey = (stepId: string) => `step:${stepId}`

// A column's type is known only once a result has shown it; until then, or
// for a text column, any text is accepted and the engine decides per grid.
export type BoundKind = "numeric" | "temporal" | "unknown"

const EMPTY = "Should not be empty"

const isBlank = (value: number | string) =>
  typeof value === "string" && value.trim() === ""

const isNumber = (value: number | string) =>
  typeof value === "number"
    ? Number.isFinite(value)
    : value.trim() !== "" && Number.isFinite(Number(value))

const unquoted = (value: number | string) =>
  String(value)
    .trim()
    .replace(/^['"]|['"]$/g, "")

const isTimestamp = (value: number | string) =>
  canonicalInstant(unquoted(value)) !== null

const boundError = (value: number | string, kind: BoundKind): string | null => {
  if (isBlank(value)) return EMPTY
  if (kind === "numeric") return isNumber(value) ? null : "Should be a number"
  if (kind === "temporal") {
    return isTimestamp(value) ? null : "Should be a timestamp"
  }
  return null
}

const asBoundComparable = (
  value: number | string,
  kind: BoundKind,
): Comparable | null => {
  if (kind === "numeric") return Number(value)
  if (kind === "temporal") return canonicalInstant(unquoted(value))
  if (typeof value === "number") return value
  const numeric = Number(value)
  if (Number.isFinite(numeric)) return numeric
  return canonicalInstant(unquoted(value))
}

const fixedBound = (bound: BetweenBound): bound is number | string =>
  bound !== null

export const validateRuleFields = (
  rule: HighlightRule,
  kind: BoundKind,
): RuleErrors => {
  const errors: RuleErrors = {}
  switch (rule.kind) {
    case "newRow":
      break
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
          if (kind === "unknown") break
          const error = boundError(condition.value, kind)
          if (error) errors.value = error
          break
        }
        case "gt":
        case "gte":
        case "lt":
        case "lte": {
          const error = boundError(condition.value, kind)
          if (error) errors.value = error
          break
        }
        case "between": {
          // A null bound is automatic and follows the data, so only fixed
          // bounds are checked and ordered.
          const from = fixedBound(condition.from)
            ? boundError(condition.from, kind)
            : null
          const to = fixedBound(condition.to)
            ? boundError(condition.to, kind)
            : null
          if (from) errors.from = from
          if (to) errors.to = to
          if (from || to) break
          if (!fixedBound(condition.from) || !fixedBound(condition.to)) break
          const low = asBoundComparable(condition.from, kind)
          const high = asBoundComparable(condition.to, kind)
          if (low === null || high === null || typeof low !== typeof high) {
            break
          }
          const order = compareValues(high, low)
          if (condition.fill.kind === "gradient" && order <= 0) {
            errors.to = "Should be above From"
          } else if (order < 0) {
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
        if (!Number.isFinite(step.from)) {
          errors[stepErrorKey(step.id)] = "Should be a number"
        } else if (seen.has(step.from)) {
          errors[stepErrorKey(step.id)] = "Duplicate bound"
        }
        seen.add(step.from)
      }
      break
    }
  }
  return errors
}
