import { describe, expect, it } from "vitest"
import type { ColumnDefinition } from "../../../../utils/questdb/types"
import { isHighlightRule } from "../../../../components/ResultGrid/highlight"
import {
  createUnsetRule,
  isCompleteRule,
  conditionOptions,
  createRule,
  moveRule,
  targetFromValue,
  targetToValue,
  withConditionOption,
  withTarget,
  type DraftRule,
} from "./ruleDraft"

describe("createRule", () => {
  it("builds a rule that passes the persisted-config guard for every condition", () => {
    // Given every condition the drawer offers
    const options = conditionOptions(null, null).map(
      (descriptor) => descriptor.value,
    )

    // When a rule is created from each one, as the drawer does
    const rules = options.map((option) =>
      createRule(option, { kind: "column", name: "price" }, option),
    )

    // Then each rule survives the guard that runs on the next load
    expect(rules.map(isHighlightRule)).toEqual(options.map(() => true))
  })
})

describe("withConditionOption", () => {
  it("switches kinds while keeping id, target and enabled state", () => {
    // Given a value rule
    const rule = createRule("r1", { kind: "column", name: "price" }, "value.gt")

    // When switched to steps and back to a previous rule
    const steps = withConditionOption(rule, "steps")
    const previous = withConditionOption(steps, "prev.changedBy")

    // Then the identity survives and each kind gets its defaults
    expect(steps).toMatchObject({
      id: "r1",
      kind: "steps",
      target: { kind: "column", name: "price" },
      display: "always",
    })
    expect(previous).toMatchObject({
      id: "r1",
      kind: "previous",
      condition: { op: "changedBy", threshold: 1, unit: "percent" },
      display: "temporary",
    })
  })

  it("carries applies-to row across kinds and starts a fresh value rule per cell", () => {
    // Given a whole-row value rule
    const rule = createRule(
      "r2",
      { kind: "column", name: "amount" },
      "value.gt",
    )
    if (rule.kind !== "value") throw new Error("Expected a value rule")
    const wholeRow = { ...rule, appliesTo: "row" as const }

    // When switched to steps, then to a between rule, then a fresh value rule is created
    const steps = withConditionOption(wholeRow, "steps")
    const between = withConditionOption(steps, "value.between")
    const fresh = createRule(
      "r3",
      { kind: "column", name: "amount" },
      "value.lt",
    )

    // Then the row choice follows the rule through kinds, and a new rule starts per cell
    expect(steps).toMatchObject({ kind: "steps", appliesTo: "row" })
    expect(between).toMatchObject({
      kind: "value",
      appliesTo: "row",
      condition: {
        op: "between",
        from: null,
        to: null,
        fill: { kind: "solid" },
      },
    })
    expect(fresh).toMatchObject({ kind: "value", appliesTo: "cell" })
  })
})

describe("conditionOptions", () => {
  it("offers every condition while the column kind is unknown", () => {
    // When listing the options for a column no result has shown yet
    const values = conditionOptions(null, null).map((o) => o.value)

    // Then comparison, value and steps conditions are all there
    expect(values).toContain("prev.gt")
    expect(values).toContain("value.between")
    expect(values).toContain("value.contains")
    expect(values).toContain("steps")
  })

  it("offers only the conditions that can match the column kind", () => {
    // When listing the options per kind
    const optionsFor = (kind: Parameters<typeof conditionOptions>[0]) =>
      conditionOptions(kind, null).map((o) => o.value)
    const numeric = optionsFor("numeric")
    const temporal = optionsFor("temporal")
    const text = optionsFor("text")
    const other = optionsFor("other")

    // Then a number never matches text
    expect(numeric).toContain("steps")
    expect(numeric).toContain("prev.changedBy")
    expect(numeric).not.toContain("value.contains")
    expect(numeric).not.toContain("value.matches")
    // And a timestamp compares and orders but never steps or changes by an amount
    expect(temporal).toContain("prev.gt")
    expect(temporal).toContain("value.between")
    expect(temporal).not.toContain("prev.changedBy")
    expect(temporal).not.toContain("steps")
    expect(temporal).not.toContain("value.contains")
    // And a text column matches text but never orders
    expect(text).toEqual([
      "prev.changed",
      "newRow",
      "value.eq",
      "value.isNull",
      "value.contains",
      "value.matches",
    ])
    // And an array column can only change, be null or be new
    expect(other).toEqual(["prev.changed", "newRow", "value.isNull"])
  })

  it("keeps a rule's saved condition listed even when its column kind excludes it", () => {
    // When listing the options for a text column whose rule was saved with steps
    const values = conditionOptions("text", "steps").map((o) => o.value)

    // Then steps stays selectable next to the text conditions
    expect(values).toContain("steps")
    expect(values).not.toContain("prev.gt")
  })
})

describe("createRule", () => {
  it("starts a comparison value empty so nothing is compared until typed", () => {
    // When a > value rule is created
    const rule = createRule("r", { kind: "column", name: "ts" }, "value.gt")

    // Then its value is empty
    expect(rule).toMatchObject({ condition: { op: "gt", value: "" } })
  })
})

describe("unset rules", () => {
  it("starts empty and only counts as complete once a condition is chosen", () => {
    // Given a freshly added row
    const unset = createUnsetRule("u")

    // When a column is chosen, then a condition
    const withColumn = {
      ...unset,
      target: { kind: "column", name: "price" } as const,
    }
    const complete = createRule("u", withColumn.target, "value.gt")

    // Then only the last state is a rule the engine can run
    expect(unset.target).toBeNull()
    expect(isCompleteRule(unset)).toBe(false)
    expect(isCompleteRule(withColumn)).toBe(false)
    expect(isCompleteRule(complete)).toBe(true)
  })
})

describe("moveRule and targets", () => {
  it("swaps neighbours and ignores moves past the edges", () => {
    // Given three rules
    const rules = ["a", "b", "c"].map((id) =>
      createRule(id, { kind: "allNumeric" }, "value.gt"),
    )

    // When moving the last one up and the first one up
    const moved = moveRule(rules, 2, -1).map((r) => r.id)
    const clamped = moveRule(rules, 0, -1)

    // Then only the valid move changes the order
    expect(moved).toEqual(["a", "c", "b"])
    expect(clamped).toBe(rules)
  })

  it("moves to either end while preserving the order of other rules", () => {
    const rules = ["a", "b", "c", "d"]

    expect(moveRule(rules, 2, "top")).toEqual(["c", "a", "b", "d"])
    expect(moveRule(rules, 1, "bottom")).toEqual(["a", "c", "d", "b"])
    expect(moveRule(rules, 0, "top")).toBe(rules)
    expect(moveRule(rules, 3, "bottom")).toBe(rules)
    expect(rules).toEqual(["a", "b", "c", "d"])
  })

  it("round-trips a target through the select value", () => {
    // Given both target shapes
    // Then each converts back to itself
    expect(targetFromValue(targetToValue({ kind: "allNumeric" }))).toEqual({
      kind: "allNumeric",
    })
    expect(
      targetFromValue(targetToValue({ kind: "column", name: "col:x" })),
    ).toEqual({
      kind: "column",
      name: "col:x",
    })
  })
})

describe("withTarget", () => {
  const columns: ColumnDefinition[] = [
    { name: "price", type: "DOUBLE" },
    { name: "volume", type: "LONG" },
    { name: "ts", type: "TIMESTAMP" },
  ]
  const gradientOn = (name: string): DraftRule => {
    const rule = createRule("r", { kind: "column", name }, "value.between")
    if (rule.kind !== "value" || rule.condition.op !== "between") {
      throw new Error("expected a between rule")
    }
    return {
      ...rule,
      condition: {
        ...rule.condition,
        fill: { kind: "gradient", highColor: "dataPositive" },
      },
    }
  }
  const fillOf = (rule: DraftRule) =>
    rule.kind === "value" && rule.condition.op === "between"
      ? rule.condition.fill.kind
      : null

  it("keeps a gradient when the rule moves to a numeric or unknown column", () => {
    // Given a gradient rule on price
    const rule = gradientOn("price")
    if (rule.kind === "newRow") throw new Error("expected a targeted rule")

    // When it moves to another numeric column and to a column no result has shown
    const onVolume = withTarget(
      rule,
      { kind: "column", name: "volume" },
      columns,
    )
    const onUnknown = withTarget(
      rule,
      { kind: "column", name: "later" },
      columns,
    )

    // Then the gradient stays
    expect(onVolume).toMatchObject({ target: { name: "volume" } })
    expect(fillOf(onVolume)).toBe("gradient")
    expect(fillOf(onUnknown)).toBe("gradient")
  })

  it("turns a gradient into a solid fill when the rule moves to a timestamp column", () => {
    // Given a gradient rule on price
    const rule = gradientOn("price")
    if (rule.kind === "newRow") throw new Error("expected a targeted rule")

    // When it moves to ts
    const onTs = withTarget(rule, { kind: "column", name: "ts" }, columns)

    // Then the range stays but the fill is solid
    expect(onTs).toMatchObject({ target: { name: "ts" } })
    expect(fillOf(onTs)).toBe("solid")
  })
})
