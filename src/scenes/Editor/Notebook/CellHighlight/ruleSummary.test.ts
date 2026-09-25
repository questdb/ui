import { describe, expect, it } from "vitest"
import { createRule, createUnsetRule } from "./ruleDraft"
import {
  ruleColors,
  ruleDescription,
  ruleFillLabel,
  ruleSummary,
} from "./ruleSummary"

describe("rule summaries", () => {
  it("distinguishes percentage and absolute thresholds and their inclusive boundary", () => {
    const rule = createRule("change", { kind: "allNumeric" }, "prev.changedBy")
    if (rule.kind !== "previous" || rule.condition.op !== "changedBy")
      throw new Error("Expected a change rule")
    expect(ruleSummary(rule)).toBe("All numeric columns changes by ≥ 1%")
    const absolute = {
      ...rule,
      condition: {
        ...rule.condition,
        unit: "absolute" as const,
        threshold: 0.5,
      },
    }
    expect(ruleSummary(absolute)).toBe(
      "All numeric columns changes by ≥ 0.5 (abs)",
    )
    expect(ruleDescription(absolute)).toBe("Flash")
  })

  it("keeps range bounds and text predicates visible when collapsed", () => {
    const range = createRule(
      "range",
      { kind: "column", name: "price" },
      "value.between",
    )
    const text = createRule(
      "text",
      { kind: "column", name: "symbol" },
      "value.contains",
    )
    if (range.kind !== "value" || text.kind !== "value")
      throw new Error("Expected value rules")
    expect(
      ruleSummary({
        ...range,
        condition: { op: "between", from: -5, to: 10, fill: { kind: "solid" } },
      }),
    ).toBe("price between -5 and 10")
    expect(
      ruleSummary({ ...text, condition: { op: "contains", text: "USD" } }),
    ).toBe("symbol contains 'USD'")
    expect(
      ruleSummary({ ...range, condition: { op: "gte", value: 100 } }),
    ).toBe("price ≥ 100")
    expect(ruleDescription(text)).toBe("Permanent")
    expect(ruleDescription({ ...text, enabled: false })).toBe("Permanent")
    expect(ruleDescription({ ...text, appliesTo: "row" })).toBe(
      "Permanent · Row",
    )
  })

  it("represents all scale colors and an unfinished draft without inventing a condition", () => {
    const steps = createRule(
      "steps",
      { kind: "column", name: "price" },
      "steps",
    )
    const between = createRule(
      "gradient",
      { kind: "column", name: "price" },
      "value.between",
    )
    if (
      steps.kind !== "steps" ||
      between.kind !== "value" ||
      between.condition.op !== "between"
    )
      throw new Error("Expected steps and between rules")
    const gradient = {
      ...between,
      condition: {
        ...between.condition,
        from: 1000,
        to: 2000,
        fill: { kind: "gradient" as const, highColor: "dataPositive" as const },
      },
    }
    expect(ruleColors(steps)).toEqual([
      steps.steps[0].color,
      steps.remainderColor,
    ])
    expect(ruleColors(gradient)).toEqual([between.color, "dataPositive"])
    expect(ruleSummary(gradient)).toBe("price between 1000 and 2000")
    expect(ruleFillLabel(gradient)).toBe("gradient")
    expect(ruleFillLabel(between)).toBeNull()
    expect(ruleSummary(createUnsetRule("draft"))).toBe("New rule")
    expect(
      ruleSummary({
        ...createUnsetRule("draft"),
        target: { kind: "column", name: "price" },
      }),
    ).toBe("price · Choose a condition")
  })
})
