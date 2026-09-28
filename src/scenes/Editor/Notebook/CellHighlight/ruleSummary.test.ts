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
    // Given a changed-by rule in percent and the same rule in absolute units
    const rule = createRule("change", { kind: "allNumeric" }, "prev.changedBy")
    if (rule.kind !== "previous" || rule.condition.op !== "changedBy")
      throw new Error("Expected a change rule")
    const absolute = {
      ...rule,
      condition: {
        ...rule.condition,
        unit: "absolute" as const,
        threshold: 0.5,
      },
    }

    // When both are summarized
    const percentSummary = ruleSummary(rule)
    const absoluteSummary = ruleSummary(absolute)

    // Then the unit and the inclusive boundary are visible
    expect(percentSummary).toBe("All numeric columns changes by ≥ 1%")
    expect(absoluteSummary).toBe("All numeric columns changes by ≥ 0.5 (abs)")
    expect(ruleDescription(absolute)).toBe("Flash")
  })

  it("names a new-row rule without a column", () => {
    // Given a new-row rule
    const fresh = createRule("fresh", null, "newRow")

    // When it is summarized
    const summary = ruleSummary(fresh)
    const description = ruleDescription(fresh)

    // Then it is a temporary row rule named without a column
    expect(fresh).toMatchObject({ kind: "newRow", display: "temporary" })
    expect(summary).toBe("New row")
    expect(description).toBe("Flash · Row")
  })

  it("keeps range bounds and text predicates visible when collapsed", () => {
    // Given a between rule and a contains rule on named columns
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
    const bounded = {
      ...range,
      condition: {
        op: "between" as const,
        from: -5,
        to: 10,
        fill: { kind: "solid" as const },
      },
    }
    const contains = {
      ...text,
      condition: { op: "contains" as const, text: "USD" },
    }
    const atLeast = { ...range, condition: { op: "gte" as const, value: 100 } }

    // When each rule is summarized
    const boundedSummary = ruleSummary(bounded)
    const autoSummary = ruleSummary(range)
    const containsSummary = ruleSummary(contains)
    const atLeastSummary = ruleSummary(atLeast)

    // Then bounds and predicates stay in the summary
    expect(boundedSummary).toBe("price between -5 and 10")
    expect(autoSummary).toBe("price between auto and auto")
    expect(containsSummary).toBe("symbol contains 'USD'")
    expect(atLeastSummary).toBe("price ≥ 100")
    expect(ruleDescription(text)).toBe("Permanent")
    expect(ruleDescription({ ...text, enabled: false })).toBe("Permanent")
    expect(ruleDescription({ ...text, appliesTo: "row" })).toBe(
      "Permanent · Row",
    )
  })

  it("represents all scale colors and an unfinished draft without inventing a condition", () => {
    // Given a steps rule, a gradient between rule, and an unfinished draft
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
    const unset = createUnsetRule("draft")
    const unsetWithColumn = {
      ...unset,
      target: { kind: "column" as const, name: "price" },
    }

    // When colors, fill labels and summaries are read
    const stepColors = ruleColors(steps)
    const gradientColors = ruleColors(gradient)
    const gradientSummary = ruleSummary(gradient)
    const unsetSummary = ruleSummary(unset)
    const unsetWithColumnSummary = ruleSummary(unsetWithColumn)

    // Then every scale color is listed and the draft names the next choice
    expect(stepColors).toEqual([steps.baseColor, steps.steps[0].color])
    expect(gradientColors).toEqual([between.color, "dataPositive"])
    expect(gradientSummary).toBe("price between 1000 and 2000")
    expect(ruleFillLabel(gradient)).toBe("gradient")
    expect(ruleFillLabel(between)).toBeNull()
    expect(unsetSummary).toBe("New rule")
    expect(unsetWithColumnSummary).toBe("price · Choose a condition")
  })
})
