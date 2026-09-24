import { describe, expect, it } from "vitest"
import {
  createUnsetRule,
  isCompleteRule,
  conditionOptionsFor,
  createRule,
  moveRule,
  targetFromValue,
  targetToValue,
  withConditionOption,
} from "./ruleDraft"

describe("withConditionOption", () => {
  it("switches kinds while keeping id, target and enabled state", () => {
    // Given a value rule
    const rule = createRule("r1", { kind: "column", name: "price" }, "value.gt")

    // When switched to a gradient and back to a previous rule
    const gradient = withConditionOption(rule, "gradient")
    const previous = withConditionOption(gradient, "prev.changedBy")

    // Then the identity survives and each kind gets its defaults
    expect(gradient).toMatchObject({
      id: "r1",
      kind: "gradient",
      target: { kind: "column", name: "price" },
      max: "auto",
      display: "always",
    })
    expect(previous).toMatchObject({
      id: "r1",
      kind: "previous",
      condition: { op: "changedBy", threshold: 1, unit: "percent" },
      display: "temporary",
    })
  })

  it("carries applies-to row across cell-or-row kinds and drops it for a gradient", () => {
    // Given a whole-row value rule
    const rule = createRule(
      "r2",
      { kind: "column", name: "amount" },
      "value.gt",
    )
    if (rule.kind !== "value") throw new Error("Expected a value rule")
    const wholeRow = { ...rule, appliesTo: "row" as const }

    // When switched to steps, then to a gradient, then back to a value rule
    const steps = withConditionOption(wholeRow, "steps")
    const gradient = withConditionOption(steps, "gradient")
    const value = withConditionOption(gradient, "value.lt")

    // Then steps keep the row, the gradient has none, and the value rule starts per cell
    expect(steps).toMatchObject({ kind: "steps", appliesTo: "row" })
    expect(gradient).not.toHaveProperty("appliesTo")
    expect(value).toMatchObject({ kind: "value", appliesTo: "cell" })
  })
})

describe("conditionOptionsFor", () => {
  it("offers only type-compatible conditions", () => {
    // When listing options per kind
    const numeric = conditionOptionsFor("numeric").map((o) => o.value)
    const text = conditionOptionsFor("text").map((o) => o.value)
    const temporal = conditionOptionsFor("temporal").map((o) => o.value)

    // Then numeric gets everything, text gets change/equality/contains, temporal gets ordering
    expect(numeric).toContain("gradient")
    expect(numeric).toContain("prev.gt")
    expect(text).toEqual([
      "prev.changed",
      "value.eq",
      "value.isNull",
      "value.contains",
      "value.matches",
    ])
    expect(temporal).toContain("value.between")
    expect(temporal).not.toContain("gradient")
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
