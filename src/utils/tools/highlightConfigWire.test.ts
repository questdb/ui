import { beforeAll, describe, expect, it, vi } from "vitest"
import { loadRe2 } from "../../components/ResultGrid/highlight"
import {
  fromHighlightConfigWire,
  regexLiteralNotes,
  toHighlightConfigWire,
  type HighlightConfigWire,
} from "./highlightConfigWire"

beforeAll(async () => {
  await loadRe2()
})

let counter = 0
vi.mock("../../components/ResultGrid/highlight/ruleId", () => ({
  createRuleId: () => `id${++counter}`,
}))

describe("fromHighlightConfigWire", () => {
  it("maps every rule kind with defaults filled in", () => {
    // Given one rule of each kind in wire shape
    const wire: HighlightConfigWire = {
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
        { kind: "value", column: "amount", op: "gte", value: 100 },
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
          steps: [{ from: 10, color: "teal" }],
        },
        {
          kind: "value",
          column: "amount",
          op: "between",
          value: 1000,
          to: 2000,
          fill: "gradient",
          color: "red",
          high_color: "green",
        },
        {
          kind: "value",
          column: "amount",
          op: "gt",
          value: 100,
          applies_to: "row",
        },
      ],
    }

    // When it is parsed
    const result = fromHighlightConfigWire(wire, [])

    // Then the config carries typed rules with ids and kind defaults
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const [up, pct, between, atLeast, contains, steps, gradient, wholeRow] =
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
    expect(atLeast).toMatchObject({
      kind: "value",
      condition: { op: "gte", value: 100 },
    })
    expect(contains).toMatchObject({
      condition: { op: "contains", text: "usdt" },
      color: "dataSeries3",
    })
    expect(steps).toMatchObject({
      target: { kind: "allNumeric" },
      steps: [{ from: 10, color: "dataSeries2" }],
      baseColor: "dataSeries3",
    })
    expect(gradient).toMatchObject({
      kind: "value",
      color: "dataNegative",
      condition: {
        op: "between",
        from: 1000,
        to: 2000,
        fill: { kind: "gradient", highColor: "dataPositive" },
      },
    })
    expect(wholeRow).toMatchObject({ kind: "value", appliesTo: "row" })
    expect(new Set(result.config.rules.map((r) => r.id)).size).toBe(8)
  })

  it("rejects a comparison rule without identity columns, as the drawer does", () => {
    // Given an empty identity with a new-row rule, and with a value rule
    const comparisonWire = {
      identity_columns: [],
      rules: [{ kind: "newRow" as const, column: null }],
    }
    const valueWire = {
      identity_columns: [],
      rules: [
        { kind: "value" as const, column: "v", op: "gt" as const, value: 1 },
      ],
    }

    // When each is parsed
    const comparison = fromHighlightConfigWire(comparisonWire, [])
    const value = fromHighlightConfigWire(valueWire, [])

    // Then only the comparison rule needs an identity
    expect(comparison).toEqual({
      ok: false,
      error: "identity_columns: Needed for comparison rules",
    })
    expect(value.ok).toBe(true)
  })

  it("rejects a non-list identity, bad ops and unknown colors with the rule index", () => {
    // Given malformed wire configs
    const noIdentityWire = {
      identity_columns: "symbol" as never,
      rules: [],
    }
    const badOpWire = {
      identity_columns: ["k"],
      rules: [{ kind: "value" as const, column: "v", op: "changed" as never }],
    }
    const badColorWire = {
      identity_columns: ["k"],
      rules: [
        {
          kind: "previous" as const,
          column: "v",
          op: "lt" as const,
          color: "hotpink" as never,
        },
      ],
    }
    const negativeThresholdWire = {
      identity_columns: ["k"],
      rules: [
        {
          kind: "previous" as const,
          column: "v",
          op: "changedBy" as const,
          threshold: -1,
        },
      ],
    }
    const fillOnGtWire = {
      identity_columns: ["k"],
      rules: [
        {
          kind: "value" as const,
          column: "v",
          op: "gt" as const,
          value: 1,
          fill: "gradient" as const,
        },
      ],
    }

    // When each is parsed
    const noIdentity = fromHighlightConfigWire(noIdentityWire, [])
    const badOp = fromHighlightConfigWire(badOpWire, [])
    const badColor = fromHighlightConfigWire(badColorWire, [])
    const negativeThreshold = fromHighlightConfigWire(negativeThresholdWire, [])
    const fillOnGt = fromHighlightConfigWire(fillOnGtWire, [])

    // Then each fails with a pointed message
    expect(noIdentity).toEqual({
      ok: false,
      error: "identity_columns must be a list of columns",
    })
    if (badOp.ok) throw new Error("expected badOp to fail")
    expect(badOp.error).toContain("rules[0]")
    expect(badColor).toMatchObject({
      ok: false,
      error: "rules[0]: unknown color 'hotpink'",
    })
    if (negativeThreshold.ok) throw new Error("expected negative to fail")
    expect(negativeThreshold.error).toBe(
      "rules[0].threshold: Should be non-negative",
    )
    if (fillOnGt.ok) throw new Error("expected fillOnGt to fail")
    expect(fillOnGt.error).toContain("apply to op between only")
  })

  it("accepts a slash-wrapped pattern and notes that it reads as plain RE2", () => {
    // Given a matches rule written like a JavaScript regex literal, and path patterns
    const withText = (text: string): HighlightConfigWire => ({
      identity_columns: ["k"],
      rules: [{ kind: "value", column: "symbol", op: "matches", text }],
    })
    const literal = withText("/eur/i")

    // When each is parsed and checked for notes
    const parsed = fromHighlightConfigWire(literal, [])
    const literalNotes = regexLiteralNotes(literal)
    const pathNotes = [
      "^/var/log/",
      "/var/log",
      "/usr/local/bin",
      "(?i)eur",
    ].flatMap((text) => regexLiteralNotes(withText(text)))

    // Then the literal saves as is, with one note that points at (?i), and paths get none
    expect(parsed.ok).toBe(true)
    expect(literalNotes).toHaveLength(1)
    expect(literalNotes[0]).toContain("rules[0]")
    expect(literalNotes[0]).toContain("(?i)eur")
    expect(pathNotes).toEqual([])
  })

  it("checks a rule against the column type once the cell has shown it", () => {
    // Given the columns a cell has shown, and a numeric comparison on a text column, a numeric column and a column not shown yet
    const columns = [
      { name: "symbol", type: "SYMBOL" },
      { name: "price", type: "DOUBLE" },
    ]
    const ruleOn = (column: string): HighlightConfigWire => ({
      identity_columns: ["k"],
      rules: [{ kind: "value", column, op: "gt", value: "abc" }],
    })

    // When each is parsed
    const onText = fromHighlightConfigWire(ruleOn("symbol"), columns)
    const onNumber = fromHighlightConfigWire(ruleOn("price"), columns)
    const onUnshown = fromHighlightConfigWire(ruleOn("later"), columns)

    // Then the shown columns fail as the drawer would, and the unshown one passes
    if (onText.ok) throw new Error("expected onText to fail")
    expect(onText.error).toBe("rules[0].condition: Not for a text column")
    if (onNumber.ok) throw new Error("expected onNumber to fail")
    expect(onNumber.error).toBe("rules[0].value: Should be a number")
    expect(onUnshown.ok).toBe(true)
  })

  it("rejects values the reload check would refuse, so a saved config never vanishes", () => {
    // Given rules with an off-enum display, an off-enum unit and a numeric column
    const badDisplayWire = {
      identity_columns: ["k"],
      rules: [
        { kind: "value" as const, column: "v", op: "gt" as const, value: 1 },
        {
          kind: "previous" as const,
          column: "v",
          op: "gt" as const,
          display: "flash" as never,
        },
      ],
    }
    const badUnitWire = {
      identity_columns: ["k"],
      rules: [
        {
          kind: "previous" as const,
          column: "v",
          op: "changedBy" as const,
          threshold: 1,
          unit: "pct" as never,
        },
      ],
    }
    const numericColumnWire = {
      identity_columns: ["k"],
      rules: [
        { kind: "value" as const, column: 5 as never, op: "isNull" as const },
      ],
    }

    // When each is parsed
    const badDisplay = fromHighlightConfigWire(badDisplayWire, [])
    const badUnit = fromHighlightConfigWire(badUnitWire, [])
    const numericColumn = fromHighlightConfigWire(numericColumnWire, [])

    // Then each fails at the rule, instead of saving a config the next load drops
    expect(badDisplay).toEqual({
      ok: false,
      error: "rules[1]: display must be temporary|always",
    })
    expect(badUnit).toEqual({
      ok: false,
      error: "rules[0]: unit must be absolute|percent",
    })
    expect(numericColumn).toEqual({
      ok: false,
      error: "rules[0]: a field has the wrong type",
    })
  })

  it("orders between bounds like the drawer and defaults changedBy to percent", () => {
    // Given a flat gradient, a reversed solid range, and a changedBy without a unit
    const between = (value: number, to: number, fill?: "gradient") => ({
      identity_columns: [],
      rules: [
        {
          kind: "value" as const,
          column: "v",
          op: "between" as const,
          value,
          to,
          fill,
        },
      ],
    })
    const noUnitWire = {
      identity_columns: ["k"],
      rules: [
        {
          kind: "previous" as const,
          column: "v",
          op: "changedBy" as const,
          threshold: 1,
        },
      ],
    }

    // When each is parsed
    const flatGradient = fromHighlightConfigWire(
      between(10, 10, "gradient"),
      [],
    )
    const reversed = fromHighlightConfigWire(between(10, 5), [])
    const flatSolid = fromHighlightConfigWire(between(10, 10), [])
    const noUnit = fromHighlightConfigWire(noUnitWire, [])

    // Then the flat gradient and the reversed range fail, and the unit is percent
    expect(flatGradient).toMatchObject({
      ok: false,
      error: "rules[0].to: Should be above From",
    })
    expect(reversed).toMatchObject({
      ok: false,
      error: "rules[0].to: Should be at least From",
    })
    expect(flatSolid.ok).toBe(true)
    expect(noUnit).toMatchObject({
      ok: true,
      config: { rules: [{ condition: { unit: "percent" } }] },
    })
  })
})

describe("fromHighlightConfigWire: new rows", () => {
  it("maps a newRow rule without a column and writes it back", () => {
    // Given a new-row rule
    const wire = {
      identity_columns: ["symbol"],
      rules: [
        {
          kind: "newRow" as const,
          column: null,
          color: "blue" as const,
          display: "temporary" as const,
        },
      ],
    }

    // When parsed and serialized back
    const parsed = fromHighlightConfigWire(wire, [])
    if (!parsed.ok) throw new Error(parsed.error)

    // Then the rule carries only color and display, and the wire round-trips
    expect(parsed.config.rules[0]).toEqual({
      id: expect.any(String) as string,
      kind: "newRow",
      enabled: true,
      display: "temporary",
      color: "dataSeries9",
    })
    expect(toHighlightConfigWire(parsed.config)).toEqual(wire)
  })
})

describe("fromHighlightConfigWire: automatic between bounds", () => {
  it("maps a null value or to onto an automatic bound and writes it back as null", () => {
    // Given a self-scaling gradient and a range open at the top
    const wire = {
      identity_columns: [],
      rules: [
        {
          kind: "value" as const,
          column: "price",
          op: "between" as const,
          value: null,
          to: null,
          fill: "gradient" as const,
          color: "red" as const,
          high_color: "green" as const,
          display: "always" as const,
        },
        {
          kind: "value" as const,
          column: "price",
          op: "between" as const,
          value: 10,
          to: null,
          color: "teal" as const,
          display: "always" as const,
        },
      ],
    }

    // When parsed
    const parsed = fromHighlightConfigWire(wire, [])
    if (!parsed.ok) throw new Error(parsed.error)

    // Then both bounds are automatic on the first rule and only `to` on the second
    expect(parsed.config.rules[0]).toMatchObject({
      condition: { op: "between", from: null, to: null },
    })
    expect(parsed.config.rules[1]).toMatchObject({
      condition: { op: "between", from: 10, to: null },
    })
    expect(toHighlightConfigWire(parsed.config)).toEqual(wire)
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
          steps: [{ from: 100, color: "teal" as const }],
          base_color: "teal" as const,
          display: "always" as const,
        },
        {
          kind: "value" as const,
          column: null,
          op: "between" as const,
          value: -100,
          to: 100,
          fill: "gradient" as const,
          color: "red" as const,
          high_color: "green" as const,
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
          steps: [{ from: 10, color: "red" as const }],
          base_color: "green" as const,
          display: "always" as const,
        },
      ],
    }
    const parsed = fromHighlightConfigWire(wire, [])
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    // When serialized back
    const back = toHighlightConfigWire(parsed.config)

    // Then it equals the input, nulls omitted
    expect(back).toEqual(wire)
  })
})
