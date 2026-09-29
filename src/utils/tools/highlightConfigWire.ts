import {
  DEFAULT_BASE_COLOR,
  DEFAULT_RULE_COLOR,
  highlightHues,
  hueOfToken,
  tokenOfHue,
  type BetweenFill,
  type ChangeUnit,
  type HighlightColorToken,
  type HighlightConfig,
  type HighlightHue,
  type HighlightDisplay,
  type HighlightRule,
  type HighlightAppliesTo,
  type HighlightStep,
  type RuleTarget,
} from "../../components/ResultGrid/highlight/types"
import { createRuleId } from "../../components/ResultGrid/highlight/ruleId"
import {
  validateIdentity,
  validateRuleFields,
} from "../../components/ResultGrid/highlight/validateRule"
import { isHighlightRule } from "../../components/ResultGrid/highlight/isHighlightConfig"

// Snake-case shape the agent tools speak for grid highlight rules, and its
// mapping to the internal HighlightConfig. One flat rule object carries every
// kind; the fields a kind does not use stay null.
export type HighlightRuleKind = "previous" | "value" | "steps" | "newRow"
export type PreviousOpWire = "gt" | "lt" | "changed" | "changedBy"
export type ValueOpWire =
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "eq"
  | "between"
  | "isNull"
  | "contains"
  | "matches"

export type HighlightStepWire = { from: number; color: HighlightHue }

export type HighlightRuleWire = {
  kind: HighlightRuleKind
  column?: string | null
  enabled?: boolean | null
  display?: HighlightDisplay | null
  applies_to?: HighlightAppliesTo | null
  color?: HighlightHue | null
  op?: PreviousOpWire | ValueOpWire | null
  value?: number | string | null
  to?: number | string | null
  threshold?: number | null
  unit?: ChangeUnit | null
  text?: string | null
  steps?: HighlightStepWire[] | null
  base_color?: HighlightHue | null
  fill?: "solid" | "gradient" | null
  high_color?: HighlightHue | null
}

export type HighlightConfigWire = {
  identity_columns: string[]
  rules: HighlightRuleWire[]
}

export type HighlightWireResult =
  | { ok: true; config: HighlightConfig }
  | { ok: false; error: string }

type MappedRule =
  | { ok: true; rule: HighlightRule }
  | { ok: false; error: string }

const PREVIOUS_OPS = new Set<string>(["gt", "lt", "changed", "changedBy"])
const VALUE_OPS = new Set<string>([
  "gt",
  "gte",
  "lt",
  "lte",
  "eq",
  "between",
  "isNull",
  "contains",
  "matches",
])
const HUES = new Set<string>(highlightHues)

const isHue = (value: unknown): value is HighlightHue =>
  typeof value === "string" && HUES.has(value)

const colorOf = (
  hue: HighlightHue | null | undefined,
  fallback: HighlightColorToken,
): HighlightColorToken => (hue == null ? fallback : tokenOfHue(hue))

const isScalar = (value: unknown): value is number | string =>
  typeof value === "number" || typeof value === "string"

const targetOf = (column: string | null | undefined): RuleTarget =>
  column == null ? { kind: "allNumeric" } : { kind: "column", name: column }

const fail = (index: number, message: string): MappedRule => ({
  ok: false,
  error: `rules[${index}]: ${message}`,
})

const mapRule = (rule: HighlightRuleWire, index: number): MappedRule => {
  const base = {
    id: createRuleId(),
    enabled: rule.enabled !== false,
    target: targetOf(rule.column),
  }
  const display: HighlightDisplay =
    rule.display ??
    (rule.kind === "previous" || rule.kind === "newRow"
      ? "temporary"
      : "always")
  if (display !== "temporary" && display !== "always") {
    return fail(index, "display must be temporary|always")
  }
  if (
    rule.applies_to != null &&
    rule.applies_to !== "cell" &&
    rule.applies_to !== "row"
  ) {
    return fail(index, "applies_to must be cell|row")
  }
  const appliesTo: HighlightAppliesTo = rule.applies_to ?? "cell"
  if (rule.color != null && !isHue(rule.color)) {
    return fail(index, `unknown color '${String(rule.color)}'`)
  }
  const color = colorOf(rule.color, DEFAULT_RULE_COLOR)
  switch (rule.kind) {
    case "newRow":
      return {
        ok: true,
        rule: {
          id: base.id,
          enabled: base.enabled,
          kind: "newRow",
          display,
          color,
        },
      }
    case "previous": {
      const op = rule.op ?? ""
      if (!PREVIOUS_OPS.has(op)) {
        return fail(index, "previous rules need op gt|lt|changed|changedBy")
      }
      if (op === "changedBy") {
        if (typeof rule.threshold !== "number") {
          return fail(index, "changedBy needs a threshold")
        }
        if (
          rule.unit != null &&
          rule.unit !== "absolute" &&
          rule.unit !== "percent"
        ) {
          return fail(index, "unit must be absolute|percent")
        }
        return {
          ok: true,
          rule: {
            ...base,
            kind: "previous",
            appliesTo,
            display,
            color,
            condition: {
              op: "changedBy",
              threshold: rule.threshold,
              unit: rule.unit ?? "percent",
            },
          },
        }
      }
      return {
        ok: true,
        rule: {
          ...base,
          kind: "previous",
          appliesTo,
          display,
          color,
          condition: { op: op as "gt" | "lt" | "changed" },
        },
      }
    }
    case "value": {
      const op = rule.op ?? ""
      if (!VALUE_OPS.has(op)) {
        return fail(
          index,
          "value rules need op gt|gte|lt|lte|eq|between|isNull|contains|matches",
        )
      }
      const common = {
        ...base,
        kind: "value" as const,
        appliesTo,
        display,
        color,
      }
      if (op === "isNull") {
        return { ok: true, rule: { ...common, condition: { op: "isNull" } } }
      }
      if (op === "contains") {
        if (typeof rule.text !== "string") {
          return fail(index, "contains needs text")
        }
        return {
          ok: true,
          rule: { ...common, condition: { op: "contains", text: rule.text } },
        }
      }
      if (op === "matches") {
        if (typeof rule.text !== "string") {
          return fail(index, "matches needs a regular expression in text")
        }
        return {
          ok: true,
          rule: {
            ...common,
            condition: { op: "matches", pattern: rule.text },
          },
        }
      }
      if (op === "between") {
        if (rule.value != null && !isScalar(rule.value)) {
          return fail(index, "between value must be a number, string or null")
        }
        if (rule.to != null && !isScalar(rule.to)) {
          return fail(index, "between to must be a number, string or null")
        }
        if (
          rule.fill != null &&
          rule.fill !== "solid" &&
          rule.fill !== "gradient"
        ) {
          return fail(index, "fill must be solid|gradient")
        }
        if (rule.high_color != null && !isHue(rule.high_color)) {
          return fail(index, "unknown high_color")
        }
        const fill: BetweenFill =
          rule.fill === "gradient"
            ? {
                kind: "gradient",
                highColor: colorOf(rule.high_color, "dataPositive"),
              }
            : { kind: "solid" }
        return {
          ok: true,
          rule: {
            ...common,
            condition: {
              op: "between",
              from: rule.value ?? null,
              to: rule.to ?? null,
              fill,
            },
          },
        }
      }
      if (!isScalar(rule.value)) return fail(index, `${op} needs a value`)
      if (rule.fill != null || rule.high_color != null) {
        return fail(index, "fill and high_color apply to op between only")
      }
      return {
        ok: true,
        rule: {
          ...common,
          condition: {
            op: op as "gt" | "gte" | "lt" | "lte" | "eq",
            value: rule.value,
          },
        },
      }
    }
    case "steps": {
      if (!Array.isArray(rule.steps)) {
        return fail(index, "steps needs a steps list")
      }
      const steps: HighlightStep[] = []
      for (const step of rule.steps) {
        if (typeof step?.from !== "number" || !isHue(step.color)) {
          return fail(index, "each step needs a numeric from and a color")
        }
        steps.push({
          id: createRuleId(),
          from: step.from,
          color: tokenOfHue(step.color),
        })
      }
      if (rule.base_color != null && !isHue(rule.base_color)) {
        return fail(index, "unknown base_color")
      }
      return {
        ok: true,
        rule: {
          ...base,
          kind: "steps",
          appliesTo,
          display,
          steps,
          baseColor: colorOf(rule.base_color, DEFAULT_BASE_COLOR),
        },
      }
    }
    default:
      return fail(
        index,
        "kind must be previous|value|steps|newRow (a scale is value between with fill gradient)",
      )
  }
}

export const wireUsesPatterns = (wire: HighlightConfigWire): boolean =>
  Array.isArray(wire.rules) && wire.rules.some((rule) => rule?.op === "matches")

export const fromHighlightConfigWire = (
  wire: HighlightConfigWire,
): HighlightWireResult => {
  if (
    !Array.isArray(wire.identity_columns) ||
    wire.identity_columns.some((name) => typeof name !== "string")
  ) {
    return { ok: false, error: "identity_columns must be a list of columns" }
  }
  if (!Array.isArray(wire.rules)) {
    return { ok: false, error: "rules must be an array" }
  }
  const rules: HighlightRule[] = []
  for (const [index, rule] of wire.rules.entries()) {
    const mapped = mapRule(rule, index)
    if (!mapped.ok) return { ok: false, error: mapped.error }
    // The load-time check drops a whole config on reload, so a rule it would
    // refuse must fail here instead.
    if (!isHighlightRule(mapped.rule)) {
      return { ok: false, error: `rules[${index}]: a field has the wrong type` }
    }
    const [firstError] = Object.entries(
      validateRuleFields(mapped.rule, "unknown"),
    )
    if (firstError) {
      const [field, message] = firstError
      return { ok: false, error: `rules[${index}].${field}: ${message}` }
    }
    rules.push(mapped.rule)
  }
  const config = { identityColumns: wire.identity_columns, rules }
  const identityError = validateIdentity(config)
  if (identityError) {
    return { ok: false, error: `identity_columns: ${identityError}` }
  }
  return { ok: true, config }
}

const columnOf = (target: RuleTarget): string | null =>
  target.kind === "column" ? target.name : null

export const toHighlightConfigWire = (
  config: HighlightConfig,
): HighlightConfigWire => ({
  identity_columns: config.identityColumns,
  rules: config.rules.map((rule): HighlightRuleWire => {
    if (rule.kind === "newRow") {
      return {
        kind: "newRow",
        column: null,
        ...(rule.enabled ? {} : { enabled: false }),
        display: rule.display,
        color: hueOfToken(rule.color),
      }
    }
    const shared: HighlightRuleWire = {
      kind: rule.kind,
      column: columnOf(rule.target),
      ...(rule.enabled ? {} : { enabled: false }),
      display: rule.display,
      ...(rule.appliesTo === "row" ? { applies_to: "row" as const } : {}),
    }
    switch (rule.kind) {
      case "previous":
        return {
          ...shared,
          color: hueOfToken(rule.color),
          op: rule.condition.op,
          ...(rule.condition.op === "changedBy"
            ? { threshold: rule.condition.threshold, unit: rule.condition.unit }
            : {}),
        }
      case "value": {
        const condition = rule.condition
        return {
          ...shared,
          color: hueOfToken(rule.color),
          op: condition.op,
          ...(condition.op === "between"
            ? {
                value: condition.from,
                to: condition.to,
                ...(condition.fill.kind === "gradient"
                  ? {
                      fill: "gradient" as const,
                      high_color: hueOfToken(condition.fill.highColor),
                    }
                  : {}),
              }
            : condition.op === "contains"
              ? { text: condition.text }
              : condition.op === "matches"
                ? { text: condition.pattern }
                : condition.op === "isNull"
                  ? {}
                  : { value: condition.value }),
        }
      }
      case "steps":
        return {
          ...shared,
          steps: rule.steps.map(({ from, color }) => ({
            from,
            color: hueOfToken(color),
          })),
          base_color: hueOfToken(rule.baseColor),
        }
    }
  }),
})
