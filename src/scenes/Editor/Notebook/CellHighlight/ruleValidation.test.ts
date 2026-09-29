import { beforeAll, describe, expect, it } from "vitest"
import { loadRe2 } from "../../../../components/ResultGrid/highlight"
import type { ColumnDefinition } from "../../../../utils/questdb/types"
import type { RuleTarget } from "../../../../components/ResultGrid/highlight"
import { createRule, createUnsetRule, type DraftRule } from "./ruleDraft"
import {
  stepErrorKey,
  validateIdentity,
  validateRule,
  validateRules,
} from "./ruleValidation"

beforeAll(async () => {
  await loadRe2()
})

const columns: ColumnDefinition[] = [
  { name: "symbol", type: "SYMBOL" },
  { name: "price", type: "DOUBLE" },
  { name: "ts", type: "TIMESTAMP" },
]
const price = { kind: "column", name: "price" } as const
const ts = { kind: "column", name: "ts" } as const
const symbol = { kind: "column", name: "symbol" } as const

const valueRule = (
  option: Parameters<typeof createRule>[2],
  target: RuleTarget = price,
) => {
  const rule = createRule("r", target, option)
  if (rule.kind === "newRow") throw new Error("expected a targeted rule")
  return rule
}

describe("validateRule", () => {
  it("requires a column after resetting a configured rule's target", () => {
    // Given a configured rule with its target cleared, then restored
    const rule = valueRule("value.gt")
    if (rule.kind !== "value") throw new Error("expected a value rule")
    const configured = { ...rule, condition: { op: "gt" as const, value: 10 } }
    const cleared: DraftRule = {
      ...configured,
      target: { kind: "column", name: "" },
    }
    const restored = { ...cleared, target: price }

    // When both are validated
    const clearedErrors = validateRule(cleared, columns)
    const restoredErrors = validateRule(restored, columns)

    // Then only the cleared rule asks for a column
    expect(clearedErrors).toEqual({ column: "Choose a column" })
    expect(restoredErrors).toEqual({})
  })

  it("asks for a column, then a condition, on an unfinished rule", () => {
    // Given a new rule with nothing chosen, then with a column
    const empty = createUnsetRule("u")
    const withColumn = { ...empty, target: price }

    // When both are validated
    const emptyErrors = validateRule(empty, columns)
    const withColumnErrors = validateRule(withColumn, columns)

    // Then each state names the next missing choice
    expect(emptyErrors).toEqual({ column: "Choose a column" })
    expect(withColumnErrors).toEqual({ condition: "Choose a condition" })
  })

  it("requires a non-negative number for the change threshold", () => {
    // Given a changed-by rule with a negative threshold, and one with zero
    const rule = valueRule("prev.changedBy")
    if (rule.kind !== "previous" || rule.condition.op !== "changedBy")
      throw new Error("expected changedBy")
    const negative = {
      ...rule,
      condition: { ...rule.condition, threshold: -1 },
    }
    const zero = { ...rule, condition: { ...rule.condition, threshold: 0 } }

    // When both are validated
    const negativeErrors = validateRule(negative, columns)
    const zeroErrors = validateRule(zero, columns)

    // Then the negative threshold is flagged, and 0 is accepted
    expect(negativeErrors).toEqual({ threshold: "Should be non-negative" })
    expect(zeroErrors).toEqual({})
  })

  it("checks a comparison value against the column kind", () => {
    // Given > value rules on a numeric and a temporal column
    const numeric = valueRule("value.gt")
    const temporal = valueRule("value.gt", ts)
    if (numeric.kind !== "value" || temporal.kind !== "value")
      throw new Error("expected value rules")
    const withValue = (rule: typeof numeric, value: string | number) => ({
      ...rule,
      condition: { op: "gt" as const, value },
    })

    // When blank, text, numeric and timestamp values are validated
    const blank = validateRule(withValue(numeric, ""), columns)
    const text = validateRule(withValue(numeric, "abc"), columns)
    const number = validateRule(withValue(numeric, "12.5"), columns)
    const words = validateRule(withValue(temporal, "yesterday"), columns)
    const timestamp = validateRule(
      withValue(temporal, "2026-09-25T10:00:00Z"),
      columns,
    )

    // Then blanks, non-numbers and non-timestamps are flagged with short messages
    expect(blank).toEqual({ value: "Should not be empty" })
    expect(text).toEqual({ value: "Should be a number" })
    expect(number).toEqual({})
    expect(words).toEqual({ value: "Should be a timestamp" })
    expect(timestamp).toEqual({})
  })

  it("accepts only ISO instants as timestamp bounds", () => {
    // Given a > value rule on the timestamp column
    const temporal = valueRule("value.gt", ts)
    if (temporal.kind !== "value") throw new Error("expected a value rule")
    const withValue = (value: string | number) => ({
      ...temporal,
      condition: { op: "gt" as const, value },
    })

    // When ISO forms and the forms Date.parse would take are validated
    const dateOnly = validateRule(withValue("2026-09-28"), columns)
    const spaced = validateRule(withValue("2026-09-28 10:00"), columns)
    const nanos = validateRule(
      withValue("2026-09-28T10:00:00.123456789Z"),
      columns,
    )
    const slashes = validateRule(withValue("2026/09/28 10:00"), columns)
    const words = validateRule(withValue("Sep 28 2026 10:00"), columns)
    const zero = validateRule(withValue(0), columns)
    const yearOnly = validateRule(withValue("2030"), columns)

    // Then only the ISO forms pass
    expect(dateOnly).toEqual({})
    expect(spaced).toEqual({})
    expect(nanos).toEqual({})
    expect(slashes).toEqual({ value: "Should be a timestamp" })
    expect(words).toEqual({ value: "Should be a timestamp" })
    expect(zero).toEqual({ value: "Should be a timestamp" })
    expect(yearOnly).toEqual({ value: "Should be a timestamp" })
  })

  it("reports an unmatched quote on a bound instead of saving a rule that never matches", () => {
    // Given > value rules on the timestamp and the numeric columns
    const temporal = valueRule("value.gt", ts)
    const numeric = valueRule("value.gt")
    if (temporal.kind !== "value" || numeric.kind !== "value")
      throw new Error("expected value rules")
    const withValue = (rule: typeof temporal, value: string) => ({
      ...rule,
      condition: { op: "gt" as const, value },
    })

    // When quoted, half-quoted and mixed-quote bounds are validated
    const paired = validateRule(withValue(temporal, "'2026-09-28'"), columns)
    const leading = validateRule(withValue(temporal, "'2026-09-28"), columns)
    const trailing = validateRule(withValue(temporal, "2026-09-28'"), columns)
    const mixed = validateRule(withValue(temporal, "'2026-09-28\""), columns)
    const lone = validateRule(withValue(temporal, "'"), columns)
    const halfNumber = validateRule(withValue(numeric, "'5"), columns)

    // Then only the matched pair passes, and every lone quote is named
    expect(paired).toEqual({})
    expect(leading).toEqual({ value: "Unmatched quote" })
    expect(trailing).toEqual({ value: "Unmatched quote" })
    expect(mixed).toEqual({ value: "Unmatched quote" })
    expect(lone).toEqual({ value: "Unmatched quote" })
    expect(halfNumber).toEqual({ value: "Unmatched quote" })
  })

  it("rejects a condition that cannot match the column kind", () => {
    // Given rules whose condition does not fit the column, and one on an unknown column
    const changedBySymbol = valueRule("prev.changedBy", symbol)
    const stepsOnTs = valueRule("steps", ts)
    const containsPrice = valueRule("value.contains", price)
    const betweenOnTs = valueRule("value.between", ts)
    if (betweenOnTs.kind !== "value") throw new Error("expected a value rule")
    const gradientOnTs = {
      ...betweenOnTs,
      condition: {
        op: "between" as const,
        from: "2026-01-01",
        to: "2026-12-31",
        fill: { kind: "gradient" as const, highColor: "dataPositive" as const },
      },
    }
    const changedByUnknown = valueRule("prev.changedBy", {
      kind: "column",
      name: "not_in_result",
    })

    // When they are validated
    const symbolErrors = validateRule(changedBySymbol, columns)
    const tsErrors = validateRule(stepsOnTs, columns)
    const priceErrors = validateRule(containsPrice, columns)
    const gradientErrors = validateRule(gradientOnTs, columns)
    const unknownErrors = validateRule(changedByUnknown, columns)

    // Then each misfit names the column kind, and the unknown column passes
    expect(symbolErrors).toEqual({ condition: "Not for a text column" })
    expect(tsErrors).toEqual({ condition: "Not for a timestamp column" })
    expect(priceErrors).toEqual({ condition: "Not for a numeric column" })
    expect(gradientErrors).toEqual({ fill: "Gradient needs a numeric column" })
    expect(unknownErrors).toEqual({})
  })

  it("lets = on a text column take any text, including empty", () => {
    // Given an = rule on symbol with an empty value
    const rule = valueRule("value.eq", symbol)
    if (rule.kind !== "value") throw new Error("expected value rule")
    const emptyText = { ...rule, condition: { op: "eq" as const, value: "" } }

    // When it is validated
    const errors = validateRule(emptyText, columns)

    // Then nothing is flagged
    expect(errors).toEqual({})
  })

  it("orders a between range and needs a real span for a gradient", () => {
    // Given between rules with the bounds reversed, equal, and correct
    const rule = valueRule("value.between")
    if (rule.kind !== "value" || rule.condition.op !== "between")
      throw new Error("expected between")
    const between = (from: number, to: number, gradient = false) => ({
      ...rule,
      condition: {
        ...rule.condition,
        from,
        to,
        fill: gradient
          ? { kind: "gradient" as const, highColor: "dataPositive" as const }
          : { kind: "solid" as const },
      },
    })

    // When each range is validated
    const reversed = validateRule(between(10, 5), columns)
    const flatSolid = validateRule(between(10, 10), columns)
    const flatGradient = validateRule(between(10, 10, true), columns)
    const spanGradient = validateRule(between(5, 10, true), columns)

    // Then To is flagged relative to From
    expect(reversed).toEqual({ to: "Should be at least From" })
    expect(flatSolid).toEqual({})
    expect(flatGradient).toEqual({ to: "Should be above From" })
    expect(spanGradient).toEqual({})
  })

  it("accepts automatic between bounds without ordering them", () => {
    // Given a gradient with both bounds automatic and a solid rule with one
    const rule = valueRule("value.between")
    if (rule.kind !== "value" || rule.condition.op !== "between")
      throw new Error("expected between")
    const auto = {
      ...rule,
      condition: {
        ...rule.condition,
        fill: { kind: "gradient" as const, highColor: "dataPositive" as const },
      },
    }
    const openTop = {
      ...rule,
      condition: { ...rule.condition, from: 10, to: null },
    }

    // When both are validated
    const autoErrors = validateRule(auto, columns)
    const openTopErrors = validateRule(openTop, columns)

    // Then nothing is flagged
    expect(autoErrors).toEqual({})
    expect(openTopErrors).toEqual({})
  })

  it("requires text for contains and a compiling pattern for matches", () => {
    // Given an empty contains rule, a broken pattern and a valid pattern
    const contains = valueRule("value.contains", symbol)
    const matches = valueRule("value.matches", symbol)
    if (contains.kind !== "value" || matches.kind !== "value")
      throw new Error("expected value rules")
    const broken = {
      ...matches,
      condition: { op: "matches" as const, pattern: "(" },
    }
    const compiling = {
      ...matches,
      condition: { op: "matches" as const, pattern: "^EUR" },
    }

    // When each is validated
    const containsErrors = validateRule(contains, columns)
    const brokenErrors = validateRule(broken, columns)
    const compilingErrors = validateRule(compiling, columns)

    // Then blanks and a broken pattern are flagged
    expect(containsErrors).toEqual({ text: "Should not be empty" })
    expect(brokenErrors).toEqual({ pattern: "Invalid expression" })
    expect(compilingErrors).toEqual({})
  })

  it("flags empty, non-numeric and duplicate step bounds", () => {
    // Given a steps rule with a duplicate bound and one with no steps
    const rule = valueRule("steps")
    if (rule.kind !== "steps") throw new Error("expected steps")
    const duplicate = {
      ...rule,
      steps: [
        { id: "a", from: 10, color: "dataSeries2" as const },
        { id: "b", from: 10, color: "dataSeries3" as const },
        { id: "c", from: Number.NaN, color: "dataSeries3" as const },
      ],
    }
    const noSteps = { ...rule, steps: [] }

    // When both are validated
    const duplicateErrors = validateRule(duplicate, columns)
    const noStepsErrors = validateRule(noSteps, columns)

    // Then only the later duplicate and the blank bound are flagged
    expect(duplicateErrors).toEqual({
      [stepErrorKey("b")]: "Duplicate bound",
      [stepErrorKey("c")]: "Should be a number",
    })
    expect(noStepsErrors).toEqual({ steps: "Add at least one step" })
  })

  it("collects errors per rule id and skips valid rules", () => {
    // Given one valid rule and one unfinished rule
    const valid = valueRule("prev.gt")
    const unset = createUnsetRule("u")

    // When all rules are validated
    const errors = validateRules([valid, unset], columns)

    // Then only the unfinished rule is listed
    expect([...errors.keys()]).toEqual(["u"])
  })
})

describe("validateIdentity", () => {
  it("requires identity columns only when a rule compares with the previous result", () => {
    // Given an empty identity with a value rule, then with a previous rule
    const valueOnly = { identityColumns: [], rules: [valueRule("value.gt")] }
    const withPrevious = {
      identityColumns: [],
      rules: [valueRule("prev.gt")],
    }
    const withIdentity = { ...withPrevious, identityColumns: ["symbol"] }

    // When each config is validated
    const valueOnlyError = validateIdentity(valueOnly)
    const withPreviousError = validateIdentity(withPrevious)
    const withIdentityError = validateIdentity(withIdentity)

    // Then only the comparison rule needs an identity
    expect(valueOnlyError).toBeNull()
    expect(withPreviousError).toBe("Needed for comparison rules")
    expect(withIdentityError).toBeNull()
  })

  it("accepts any text for a comparison on a column of unknown type", () => {
    // Given a > value rule on a column no result has shown yet
    const rule = valueRule("value.gt", { kind: "column", name: "later" })
    if (rule.kind !== "value") throw new Error("expected value rule")
    const text = { ...rule, condition: { op: "gt" as const, value: "abc" } }
    const blank = { ...rule, condition: { op: "gt" as const, value: "" } }

    // When both are validated
    const textErrors = validateRule(text, columns)
    const blankErrors = validateRule(blank, columns)

    // Then text is accepted, only blank is flagged
    expect(textErrors).toEqual({})
    expect(blankErrors).toEqual({ value: "Should not be empty" })
  })
})
