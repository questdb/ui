import { describe, expect, it } from "vitest"
import {
  fromHighlightConfigWire,
  toHighlightConfigWire,
} from "./highlightConfigWire"

let counter = 0
const nextId = () => `id${++counter}`

describe("fromHighlightConfigWire", () => {
  it("maps every rule kind with defaults filled in", () => {
    // Given one rule of each kind in wire shape
    const result = fromHighlightConfigWire(
      {
        identity_columns: ["symbol"],
        rules: [
          {
            kind: "previous",
            column: "price",
            op: "gt",
            color: "green",
          },
          {
            kind: "previous",
            column: "price",
            op: "changedBy",
            threshold: 2,
            unit: "percent",
          },
          { kind: "value", column: "amount", op: "between", value: 1, to: 5 },
          {
            kind: "value",
            column: "symbol",
            op: "contains",
            text: "usdt",
            color: "amber",
          },
          {
            kind: "steps",
            column: null,
            steps: [{ below: 10, color: "teal" }],
          },
          { kind: "gradient", column: "amount", max: 100 },
          {
            kind: "value",
            column: "amount",
            op: "gt",
            value: 100,
            applies_to: "row",
          },
        ],
      },
      nextId,
    )

    // Then the config carries typed rules with ids and kind defaults
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const [up, pct, between, contains, steps, gradient, wholeRow] =
      result.config.rules
    expect(up).toMatchObject({
      kind: "previous",
      target: { kind: "column", name: "price" },
      condition: { op: "gt" },
      color: "dataPositive",
      display: "temporary",
      enabled: true,
      appliesTo: "cell",
    })
    expect(pct).toMatchObject({
      condition: { op: "changedBy", threshold: 2, unit: "percent" },
    })
    expect(between).toMatchObject({
      kind: "value",
      condition: { op: "between", from: 1, to: 5 },
      display: "always",
    })
    expect(contains).toMatchObject({
      condition: { op: "contains", text: "usdt" },
      color: "dataSeries3",
    })
    expect(steps).toMatchObject({
      target: { kind: "allNumeric" },
      steps: [{ below: 10, color: "dataSeries2" }],
      remainderColor: "dataSeries3",
    })
    expect(gradient).toMatchObject({
      max: 100,
      negativeColor: "dataNegative",
      positiveColor: "dataPositive",
    })
    expect(wholeRow).toMatchObject({ kind: "value", appliesTo: "row" })
    expect(gradient).not.toHaveProperty("appliesTo")
    expect(new Set(result.config.rules.map((r) => r.id)).size).toBe(7)
  })

  it("rejects missing identity, bad ops and unknown colors with the rule index", () => {
    // Given malformed wire configs
    const noIdentity = fromHighlightConfigWire({
      identity_columns: [],
      rules: [],
    })
    const badOp = fromHighlightConfigWire({
      identity_columns: ["k"],
      rules: [{ kind: "value", column: "v", op: "changed" }],
    })
    const badColor = fromHighlightConfigWire({
      identity_columns: ["k"],
      rules: [
        { kind: "previous", column: "v", op: "lt", color: "hotpink" as never },
      ],
    })
    const rowGradient = fromHighlightConfigWire({
      identity_columns: ["k"],
      rules: [{ kind: "gradient", column: "v", applies_to: "row" }],
    })

    // Then each fails with a pointed message
    expect(noIdentity).toEqual({
      ok: false,
      error: "identity_columns needs at least one column",
    })
    if (badOp.ok) throw new Error("expected badOp to fail")
    expect(badOp.error).toContain("rules[0]")
    expect(badColor).toMatchObject({
      ok: false,
      error: "rules[0]: unknown color 'hotpink'",
    })
    if (rowGradient.ok) throw new Error("expected rowGradient to fail")
    expect(rowGradient.error).toContain("applies_to must be cell")
  })
})

describe("toHighlightConfigWire", () => {
  it("round-trips through the wire shape", () => {
    // Given a config parsed from wire
    const wire = {
      identity_columns: ["symbol", "side"],
      rules: [
        {
          kind: "previous" as const,
          column: "price",
          op: "lt" as const,
          color: "red" as const,
          display: "temporary" as const,
        },
        {
          kind: "value" as const,
          column: "amount",
          op: "gt" as const,
          value: 1000,
          color: "lime" as const,
          display: "always" as const,
          enabled: false,
        },
        {
          kind: "steps" as const,
          column: "price",
          steps: [{ below: 100, color: "teal" as const }],
          remainder_color: "teal" as const,
          display: "always" as const,
        },
        {
          kind: "gradient" as const,
          column: null,
          negative_color: "red" as const,
          positive_color: "green" as const,
          display: "always" as const,
        },
        {
          kind: "value" as const,
          column: "symbol",
          op: "matches" as const,
          text: "^EUR",
          color: "purple" as const,
          display: "always" as const,
        },
        {
          kind: "steps" as const,
          column: "amount",
          applies_to: "row" as const,
          steps: [{ below: 10, color: "red" as const }],
          remainder_color: "green" as const,
          display: "always" as const,
        },
      ],
    }
    const parsed = fromHighlightConfigWire(wire, nextId)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    // When serialized back
    const back = toHighlightConfigWire(parsed.config)

    // Then it equals the input, nulls omitted
    expect(back).toEqual(wire)
  })
})
