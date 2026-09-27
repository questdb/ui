import { describe, expect, it } from "vitest"
import { isHighlightConfig } from "./isHighlightConfig"

const rule = {
  id: "r1",
  kind: "value",
  enabled: true,
  target: { kind: "column", name: "price" },
  display: "always",
  appliesTo: "cell",
  condition: { op: "between", from: null, to: 10, fill: { kind: "solid" } },
  color: "dataSeries2",
}

describe("isHighlightConfig", () => {
  it("accepts a complete config of every rule kind", () => {
    // Given one rule of each kind, with an automatic between bound
    const config = {
      identityColumns: ["symbol"],
      rules: [
        rule,
        {
          ...rule,
          id: "r2",
          kind: "previous",
          condition: { op: "changedBy", threshold: 1, unit: "percent" },
        },
        {
          ...rule,
          id: "r3",
          kind: "steps",
          steps: [{ id: "s1", below: 10, color: "dataNegative" }],
          remainderColor: "dataPositive",
        },
      ],
    }

    // Then it passes
    expect(isHighlightConfig(config)).toBe(true)
  })

  it("rejects a rule with a missing target, an unknown color or a half-built condition", () => {
    // Given rules that a hand-edited import file could carry
    const { target: _target, ...noTarget } = rule
    const badColor = { ...rule, color: "hotpink" }
    const noValue = { ...rule, condition: { op: "gt" } }
    const kindOnly = { kind: "value" }

    // Then each one fails
    for (const broken of [noTarget, badColor, noValue, kindOnly]) {
      expect(isHighlightConfig({ identityColumns: [], rules: [broken] })).toBe(
        false,
      )
    }
  })
})
