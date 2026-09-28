import {
  highlightColorTokens,
  type HighlightConfig,
  type HighlightRule,
} from "./types"

// Structural check for a config read from storage or an import file, where
// any field may be missing or of the wrong type. A config that passes can be
// evaluated without throwing.
const COLORS = new Set<string>(highlightColorTokens)
const PREVIOUS_OPS = new Set(["gt", "lt", "changed", "changedBy"])
const VALUE_OPS = new Set(["gt", "gte", "lt", "lte", "eq"])
const DISPLAYS = new Set(["temporary", "always"])
const APPLIES_TO = new Set(["cell", "row"])

type Record = { [key: string]: unknown }

const isRecord = (value: unknown): value is Record =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const isColor = (value: unknown) =>
  typeof value === "string" && COLORS.has(value)

const isScalar = (value: unknown) =>
  typeof value === "number" || typeof value === "string"

const isBound = (value: unknown) => value === null || isScalar(value)

const isTarget = (value: unknown) =>
  isRecord(value) &&
  (value.kind === "allNumeric" ||
    (value.kind === "column" && typeof value.name === "string"))

const isPreviousCondition = (value: unknown) =>
  isRecord(value) &&
  typeof value.op === "string" &&
  PREVIOUS_OPS.has(value.op) &&
  (value.op !== "changedBy" ||
    (typeof value.threshold === "number" &&
      (value.unit === "absolute" || value.unit === "percent")))

const isBetweenFill = (value: unknown) =>
  isRecord(value) &&
  (value.kind === "solid" ||
    (value.kind === "gradient" && isColor(value.highColor)))

const isValueCondition = (value: unknown) => {
  if (!isRecord(value) || typeof value.op !== "string") return false
  if (VALUE_OPS.has(value.op)) return isScalar(value.value)
  switch (value.op) {
    case "between":
      return (
        isBound(value.from) && isBound(value.to) && isBetweenFill(value.fill)
      )
    case "isNull":
      return true
    case "contains":
      return typeof value.text === "string"
    case "matches":
      return typeof value.pattern === "string"
    default:
      return false
  }
}

const isStep = (value: unknown) =>
  isRecord(value) &&
  typeof value.id === "string" &&
  typeof value.from === "number" &&
  isColor(value.color)

const isRuleBase = (value: Record) =>
  typeof value.id === "string" &&
  typeof value.enabled === "boolean" &&
  typeof value.display === "string" &&
  DISPLAYS.has(value.display)

const isTargeted = (value: Record) =>
  isTarget(value.target) &&
  typeof value.appliesTo === "string" &&
  APPLIES_TO.has(value.appliesTo)

export const isHighlightRule = (value: unknown): value is HighlightRule => {
  if (!isRecord(value) || !isRuleBase(value)) return false
  if (value.kind === "newRow") return isColor(value.color)
  if (!isTargeted(value)) return false
  switch (value.kind) {
    case "previous":
      return isColor(value.color) && isPreviousCondition(value.condition)
    case "value":
      return isColor(value.color) && isValueCondition(value.condition)
    case "steps":
      return (
        Array.isArray(value.steps) &&
        value.steps.every(isStep) &&
        isColor(value.baseColor)
      )
    default:
      return false
  }
}

export const isHighlightConfig = (value: unknown): value is HighlightConfig =>
  isRecord(value) &&
  Array.isArray(value.identityColumns) &&
  value.identityColumns.every((name) => typeof name === "string") &&
  Array.isArray(value.rules) &&
  value.rules.every(isHighlightRule)
