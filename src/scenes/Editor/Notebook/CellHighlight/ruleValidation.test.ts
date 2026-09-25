import { describe, expect, it } from "vitest"
import type { ColumnDefinition } from "../../../../utils/questdb/types"
import { createRule, createUnsetRule, type DraftRule } from "./ruleDraft"
import {
  stepErrorKey,
  validateIdentity,
  validateRule,
  validateRules,
} from "./ruleValidation"

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
  target: DraftRule["target"] = price,
) => createRule("r", target!, option)

describe("validateRule", () => {
  it("requires a column after resetting a configured rule's target", () => {
    const configured = valueRule("value.gt")
    const cleared: DraftRule = {
      ...configured,
      target: { kind: "column", name: "" },
    }
    expect(validateRule(cleared, columns)).toEqual({
      column: "Choose a column",
    })
    expect(validateRule({ ...cleared, target: price }, columns)).toEqual({})
  })

  it("asks for a column, then a condition, on an unfinished rule", () => {
    // Given a new rule with nothing chosen, then with a column
    const empty = createUnsetRule("u")
    const withColumn = { ...empty, target: price }

    // Then each state names the next missing choice
    expect(validateRule(empty, columns)).toEqual({ column: "Choose a column" })
    expect(validateRule(withColumn, columns)).toEqual({
      condition: "Choose a condition",
    })
  })

  it("requires a non-negative number for the change threshold", () => {
    // Given a changed-by rule with a negative threshold
    const rule = valueRule("prev.changedBy")
    if (rule.kind !== "previous" || rule.condition.op !== "changedBy")
      throw new Error("expected changedBy")
    const negative = {
      ...rule,
      condition: { ...rule.condition, threshold: -1 },
    }

    // Then the threshold is flagged, and 0 is accepted
    expect(validateRule(negative, columns)).toEqual({
      threshold: "Should be non-negative",
    })
    expect(
      validateRule(
        { ...rule, condition: { ...rule.condition, threshold: 0 } },
        columns,
      ),
    ).toEqual({})
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

    // Then blanks, non-numbers and non-timestamps are flagged with short messages
    expect(validateRule(withValue(numeric, ""), columns)).toEqual({
      value: "Should not be empty",
    })
    expect(validateRule(withValue(numeric, "abc"), columns)).toEqual({
      value: "Should be a number",
    })
    expect(validateRule(withValue(numeric, "12.5"), columns)).toEqual({})
    expect(validateRule(withValue(temporal, "yesterday"), columns)).toEqual({
      value: "Should be a timestamp",
    })
    expect(
      validateRule(withValue(temporal, "2026-09-25T10:00:00Z"), columns),
    ).toEqual({})
  })

  it("lets = on a text column take any text, including empty", () => {
    // Given an = rule on symbol with an empty value
    const rule = valueRule("value.eq", symbol)
    if (rule.kind !== "value") throw new Error("expected value rule")

    // Then nothing is flagged
    expect(
      validateRule({ ...rule, condition: { op: "eq", value: "" } }, columns),
    ).toEqual({})
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

    // Then To is flagged relative to From
    expect(validateRule(between(10, 5), columns)).toEqual({
      to: "Should be at least From",
    })
    expect(validateRule(between(10, 10), columns)).toEqual({})
    expect(validateRule(between(10, 10, true), columns)).toEqual({
      to: "Should be above From",
    })
    expect(validateRule(between(5, 10, true), columns)).toEqual({})
  })

  it("requires text for contains and a compiling pattern for matches", () => {
    // Given contains and matches rules on symbol
    const contains = valueRule("value.contains", symbol)
    const matches = valueRule("value.matches", symbol)
    if (contains.kind !== "value" || matches.kind !== "value")
      throw new Error("expected value rules")

    // Then blanks and a broken pattern are flagged
    expect(validateRule(contains, columns)).toEqual({
      text: "Should not be empty",
    })
    expect(
      validateRule(
        { ...matches, condition: { op: "matches", pattern: "(" } },
        columns,
      ),
    ).toEqual({ pattern: "Invalid expression" })
    expect(
      validateRule(
        { ...matches, condition: { op: "matches", pattern: "^EUR" } },
        columns,
      ),
    ).toEqual({})
  })

  it("flags empty, non-numeric and duplicate step bounds", () => {
    // Given a steps rule with a duplicate bound and one with no steps
    const rule = valueRule("steps")
    if (rule.kind !== "steps") throw new Error("expected steps")
    const duplicate = {
      ...rule,
      steps: [
        { id: "a", below: 10, color: "dataSeries2" as const },
        { id: "b", below: 10, color: "dataSeries3" as const },
        { id: "c", below: Number.NaN, color: "dataSeries3" as const },
      ],
    }

    // Then only the later duplicate and the blank bound are flagged
    expect(validateRule(duplicate, columns)).toEqual({
      [stepErrorKey("b")]: "Duplicate bound",
      [stepErrorKey("c")]: "Should be a number",
    })
    expect(validateRule({ ...rule, steps: [] }, columns)).toEqual({
      steps: "Add at least one step",
    })
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

    // Then only the comparison rule needs an identity
    expect(validateIdentity(valueOnly)).toBeNull()
    expect(validateIdentity(withPrevious)).toBe("Needed for comparison rules")
    expect(
      validateIdentity({ ...withPrevious, identityColumns: ["symbol"] }),
    ).toBeNull()
  })

  it("accepts any text for a comparison on a column of unknown type", () => {
    // Given a > value rule on a column no result has shown yet
    const rule = valueRule("value.gt", { kind: "column", name: "later" })
    if (rule.kind !== "value") throw new Error("expected value rule")

    // Then text is accepted, only blank is flagged
    expect(
      validateRule({ ...rule, condition: { op: "gt", value: "abc" } }, columns),
    ).toEqual({})
    expect(
      validateRule({ ...rule, condition: { op: "gt", value: "" } }, columns),
    ).toEqual({ value: "Should not be empty" })
  })
})
