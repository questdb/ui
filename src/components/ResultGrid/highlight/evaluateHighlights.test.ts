import { describe, expect, it } from "vitest"
import type { ColumnDefinition } from "../../../utils/questdb/types"
import type { ResultGridRow } from "../types"
import { evaluateHighlights } from "./evaluateHighlights"
import { buildIdentityIndex } from "./identityIndex"
import type { HighlightConfig, HighlightRule } from "./types"

const columns: ColumnDefinition[] = [
  { name: "symbol", type: "SYMBOL" },
  { name: "price", type: "DOUBLE" },
  { name: "amount", type: "DOUBLE" },
  { name: "ts", type: "TIMESTAMP" },
]

const SYMBOL = 0
const PRICE = 1
const AMOUNT = 2
const TS = 3

const row = (
  symbol: string,
  price: number | null,
  amount: number,
  ts = "2026-09-24T10:00:00.000000Z",
): ResultGridRow => [symbol, price, amount, ts]

const previousOf = (rows: ResultGridRow[]) => buildIdentityIndex(rows, [SYMBOL])

const rule = (partial: Partial<HighlightRule> & Pick<HighlightRule, "kind">) =>
  ({
    id: "r",
    enabled: true,
    target: { kind: "column", name: "price" },
    display: "always",
    appliesTo: "cell",
    ...partial,
  }) as HighlightRule

const config = (
  rules: HighlightRule[],
  identityColumns = ["symbol"],
): HighlightConfig => ({ identityColumns, rules })

describe("evaluateHighlights: previous result rules", () => {
  it("colors an increase and a decrease against the matched previous row", () => {
    // Given a previous result and two rules on price
    const previous = previousOf([row("BTC", 100, 1), row("ETH", 50, 1)])
    const dataset = [row("BTC", 101, 1), row("ETH", 49, 1)]
    const rules = [
      rule({
        id: "up",
        kind: "previous",
        condition: { op: "gt" },
        color: "dataPositive",
        display: "temporary",
      }),
      rule({
        id: "down",
        kind: "previous",
        condition: { op: "lt" },
        color: "dataNegative",
        display: "temporary",
      }),
    ]

    // When the new result is evaluated
    const { lookup, stats } = evaluateHighlights({
      columns,
      dataset,
      config: config(rules),
      previous,
    })

    // Then each cell gets the matching color and direction
    expect(lookup.background(0, PRICE)).toEqual({
      color: "dataPositive",
      alpha: 1,
      display: "temporary",
    })
    expect(lookup.direction(0, PRICE)).toBe("up")
    expect(lookup.background(1, PRICE)?.color).toBe("dataNegative")
    expect(lookup.direction(1, PRICE)).toBe("down")
    expect(stats).toEqual({ total: 2, matched: 2, added: 0, ambiguous: 0 })
  })

  it("does not compare when there is no previous result", () => {
    // Given no baseline
    const rules = [
      rule({
        kind: "previous",
        condition: { op: "changed" },
        color: "dataSeries2",
      }),
    ]

    // When evaluated
    const { lookup, stats } = evaluateHighlights({
      columns,
      dataset: [row("BTC", 1, 1)],
      config: config(rules),
      previous: null,
    })

    // Then nothing is highlighted and there are no stats
    expect(lookup.background(0, PRICE)).toBeUndefined()
    expect(stats).toBeNull()
  })

  it("counts new rows and skips ambiguous keys", () => {
    // Given a previous result with a duplicated key and a new row
    const previous = previousOf([row("BTC", 1, 1), row("BTC", 2, 1)])
    const dataset = [row("BTC", 3, 1), row("SOL", 1, 1), row("SOL", 2, 1)]
    const rules = [
      rule({
        kind: "previous",
        condition: { op: "changed" },
        color: "dataSeries2",
      }),
    ]

    // When evaluated
    const { lookup, stats } = evaluateHighlights({
      columns,
      dataset,
      config: config(rules),
      previous,
    })

    // Then the ambiguous key is not compared, the new key counts as added,
    // and the duplicated current key counts as ambiguous
    expect(lookup.background(0, PRICE)).toBeUndefined()
    expect(stats).toEqual({ total: 3, matched: 0, added: 1, ambiguous: 1 })
  })

  it("detects a change on a text column", () => {
    // Given the symbol column changed its side value
    const sideColumns: ColumnDefinition[] = [
      { name: "id", type: "LONG" },
      { name: "status", type: "STRING" },
    ]
    const previous = buildIdentityIndex([[1, "open"]], [0])
    const rules = [
      rule({
        kind: "previous",
        target: { kind: "column", name: "status" },
        condition: { op: "changed" },
        color: "dataSeries2",
      }),
    ]

    // When evaluated
    const { lookup } = evaluateHighlights({
      columns: sideColumns,
      dataset: [[1, "filled"]],
      config: config(rules, ["id"]),
      previous,
    })

    // Then the text cell is highlighted
    expect(lookup.background(0, 1)?.color).toBe("dataSeries2")
  })

  it("applies an absolute and a percent threshold, and never matches a zero baseline in percent", () => {
    // Given three rows with different deltas
    const previous = previousOf([
      row("A", 100, 1),
      row("B", 100, 1),
      row("C", 0, 1),
    ])
    const dataset = [row("A", 100.5, 1), row("B", 103, 1), row("C", 5, 1)]
    const absolute = rule({
      id: "abs",
      kind: "previous",
      condition: { op: "changedBy", threshold: 1, unit: "absolute" },
      color: "dataSeries2",
    })
    const percent = rule({
      id: "pct",
      kind: "previous",
      condition: { op: "changedBy", threshold: 2, unit: "percent" },
      color: "dataSeries2",
    })

    // When evaluated with each rule
    const byAbsolute = evaluateHighlights({
      columns,
      dataset,
      config: config([absolute]),
      previous,
    }).lookup
    const byPercent = evaluateHighlights({
      columns,
      dataset,
      config: config([percent]),
      previous,
    }).lookup

    // Then only the rows past the threshold match
    expect(byAbsolute.background(0, PRICE)).toBeUndefined()
    expect(byAbsolute.background(1, PRICE)).toBeDefined()
    expect(byPercent.background(0, PRICE)).toBeUndefined()
    expect(byPercent.background(1, PRICE)).toBeDefined()
    expect(byPercent.background(2, PRICE)).toBeUndefined()

    // And a threshold of 0 flags any change but never an unchanged cell
    const anyChange = evaluateHighlights({
      columns,
      dataset: [row("A", 100, 1), row("B", 100.001, 1)],
      config: config([
        rule({
          id: "any",
          kind: "previous",
          condition: { op: "changedBy", threshold: 0, unit: "absolute" },
          color: "dataSeries2",
        }),
      ]),
      previous,
    }).lookup
    expect(anyChange.background(0, PRICE)).toBeUndefined()
    expect(anyChange.background(1, PRICE)).toBeDefined()
  })

  it("keeps the direction glyph when a value rule wins the background", () => {
    // Given a breach rule listed before the movement rule
    const previous = previousOf([row("BTC", 200, 1)])
    const rules = [
      rule({
        id: "limit",
        kind: "value",
        condition: { op: "gt", value: 100 },
        color: "dataSeries3",
      }),
      rule({
        id: "down",
        kind: "previous",
        condition: { op: "lt" },
        color: "dataNegative",
      }),
    ]

    // When the price drops but stays above the limit
    const { lookup } = evaluateHighlights({
      columns,
      dataset: [row("BTC", 150, 1)],
      config: config(rules),
      previous,
    })

    // Then the limit color wins and the direction still shows
    expect(lookup.background(0, PRICE)?.color).toBe("dataSeries3")
    expect(lookup.direction(0, PRICE)).toBe("down")
  })
})

describe("evaluateHighlights: value rules", () => {
  const evaluate = (rules: HighlightRule[], dataset: ResultGridRow[]) =>
    evaluateHighlights({
      columns,
      dataset,
      config: config(rules, []),
      previous: null,
    }).lookup

  it("matches numeric comparisons and between", () => {
    // Given a between rule on amount
    const rules = [
      rule({
        kind: "value",
        target: { kind: "column", name: "amount" },
        condition: { op: "between", from: 10, to: 20, fill: { kind: "solid" } },
        color: "dataSeries4",
      }),
    ]

    // When evaluated
    const lookup = evaluate(rules, [
      row("A", 1, 5),
      row("A", 1, 15),
      row("A", 1, 20),
    ])

    // Then only the in-range cells match, bounds included
    expect(lookup.background(0, AMOUNT)).toBeUndefined()
    expect(lookup.background(1, AMOUNT)).toBeDefined()
    expect(lookup.background(2, AMOUNT)).toBeDefined()
  })

  it("treats ≥ and ≤ as inclusive and > and < as strict", () => {
    // Given one rule of each comparison on amount, all against 10
    const at = (op: "gt" | "gte" | "lt" | "lte") =>
      rule({
        id: op,
        kind: "value",
        target: { kind: "column", name: "amount" },
        condition: { op, value: 10 },
        color: "dataSeries4",
      })

    // When a cell equals the bound
    const matchesAtBound = (op: "gt" | "gte" | "lt" | "lte") =>
      evaluate([at(op)], [row("A", 1, 10)]).background(0, AMOUNT) !== undefined

    // Then only the inclusive ops match it
    expect(matchesAtBound("gt")).toBe(false)
    expect(matchesAtBound("gte")).toBe(true)
    expect(matchesAtBound("lt")).toBe(false)
    expect(matchesAtBound("lte")).toBe(true)
  })

  it("compares timestamps as instants", () => {
    // Given a rule on the timestamp column
    const rules = [
      rule({
        kind: "value",
        target: { kind: "column", name: "ts" },
        condition: { op: "gt", value: "2026-09-24T09:00:00Z" },
        color: "dataSeries5",
      }),
    ]

    // When evaluated
    const lookup = evaluate(rules, [
      row("A", 1, 1, "2026-09-24T10:00:00.000000Z"),
      row("A", 1, 1, "2026-09-24T08:00:00.000000Z"),
    ])

    // Then only the later row matches
    expect(lookup.background(0, TS)).toBeDefined()
    expect(lookup.background(1, TS)).toBeUndefined()
  })

  it("matches null and text contains", () => {
    // Given an is-null rule on price and a contains rule on symbol
    const rules = [
      rule({
        id: "n",
        kind: "value",
        condition: { op: "isNull" },
        color: "dataSeries6",
      }),
      rule({
        id: "c",
        kind: "value",
        target: { kind: "column", name: "symbol" },
        condition: { op: "contains", text: "usdt" },
        color: "dataSeries8",
      }),
    ]

    // When evaluated
    const lookup = evaluate(rules, [
      row("BTC-USDT", null, 1),
      row("ETH-BTC", 1, 1),
    ])

    // Then the null price and the matching symbol are highlighted
    expect(lookup.background(0, PRICE)?.color).toBe("dataSeries6")
    expect(lookup.background(0, SYMBOL)?.color).toBe("dataSeries8")
    expect(lookup.background(1, SYMBOL)).toBeUndefined()
  })

  it("ignores surrounding quotes and whitespace in text comparisons", () => {
    // Given equality and contains rules typed the SQL way, with quotes
    const rules = [
      rule({
        id: "eq",
        kind: "value",
        target: { kind: "column", name: "symbol" },
        condition: { op: "eq", value: " 'BTC-USDT' " },
        color: "dataSeries2",
      }),
      rule({
        id: "contains",
        kind: "value",
        target: { kind: "column", name: "symbol" },
        condition: { op: "contains", text: '"eth"' },
        color: "dataSeries3",
      }),
    ]

    // When evaluated
    const lookup = evaluate(rules, [
      row("BTC-USDT", 1, 1),
      row("ETH-BTC", 1, 1),
    ])

    // Then both rows match without the quotes
    expect(lookup.background(0, SYMBOL)?.color).toBe("dataSeries2")
    expect(lookup.background(1, SYMBOL)?.color).toBe("dataSeries3")
  })

  it("matches a regular expression, honours /flags/, and never matches an invalid pattern", () => {
    // Given a case-sensitive pattern, a flagged one and a broken one on symbol
    const symbolRule = (
      id: string,
      pattern: string,
      color: "dataSeries2" | "dataSeries3" | "dataSeries4",
    ) =>
      rule({
        id,
        kind: "value",
        target: { kind: "column", name: "symbol" },
        condition: { op: "matches", pattern },
        color,
      })
    const dataset = [
      row("BTC-USDT", 1, 1),
      row("eth-btc", 1, 1),
      row("SOL-USDT", 1, 1),
    ]

    // When each rule is evaluated alone
    const anchored = evaluate([symbolRule("a", "^BTC", "dataSeries2")], dataset)
    const flagged = evaluate(
      [symbolRule("b", "/^eth/i", "dataSeries3")],
      dataset,
    )
    const broken = evaluate([symbolRule("c", "(", "dataSeries4")], dataset)

    // Then only the intended rows match and the broken pattern matches nothing
    expect(anchored.background(0, SYMBOL)?.color).toBe("dataSeries2")
    expect(anchored.background(2, SYMBOL)).toBeUndefined()
    expect(flagged.background(1, SYMBOL)?.color).toBe("dataSeries3")
    expect(broken.background(0, SYMBOL)).toBeUndefined()
  })

  it("applies the first matching rule and ignores disabled rules", () => {
    // Given a disabled rule first, then two overlapping rules
    const rules = [
      rule({
        id: "off",
        kind: "value",
        enabled: false,
        condition: { op: "gt", value: 0 },
        color: "dataSeries2",
      }),
      rule({
        id: "a",
        kind: "value",
        condition: { op: "gt", value: 10 },
        color: "dataSeries2",
      }),
      rule({
        id: "b",
        kind: "value",
        condition: { op: "gt", value: 5 },
        color: "dataSeries3",
      }),
    ]

    // When evaluated
    const lookup = evaluate(rules, [row("A", 20, 1), row("A", 7, 1)])

    // Then order decides and the disabled rule never matches
    expect(lookup.background(0, PRICE)?.color).toBe("dataSeries2")
    expect(lookup.background(1, PRICE)?.color).toBe("dataSeries3")
  })

  it("targets every numeric column with one rule", () => {
    // Given an all-numeric rule
    const rules = [
      rule({
        kind: "value",
        target: { kind: "allNumeric" },
        condition: { op: "gt", value: 0 },
        color: "dataSeries8",
      }),
    ]

    // When evaluated
    const lookup = evaluate(rules, [row("A", 1, 1)])

    // Then price and amount match, symbol and ts do not
    expect(lookup.background(0, PRICE)).toBeDefined()
    expect(lookup.background(0, AMOUNT)).toBeDefined()
    expect(lookup.background(0, SYMBOL)).toBeUndefined()
    expect(lookup.background(0, TS)).toBeUndefined()
  })
})

describe("evaluateHighlights: rules that apply to the row", () => {
  const evaluate = (rules: HighlightRule[], dataset: ResultGridRow[]) =>
    evaluateHighlights({
      columns,
      dataset,
      config: config(rules),
      previous: null,
    }).lookup

  it("colors the row of a matching cell and leaves other rows alone", () => {
    // Given a value rule on amount that applies to the row
    const rules = [
      rule({
        kind: "value",
        target: { kind: "column", name: "amount" },
        appliesTo: "row",
        condition: { op: "gt", value: 100 },
        color: "dataSeries10",
      }),
    ]

    // When one row breaches and one does not
    const lookup = evaluate(rules, [row("A", 1, 500), row("B", 1, 5)])

    // Then every cell of the breaching row gets the color
    expect(lookup.row(0)).toEqual({
      color: "dataSeries10",
      alpha: 1,
      display: "always",
    })
    expect(lookup.background(0, AMOUNT)?.color).toBe("dataSeries10")
    expect(lookup.background(0, SYMBOL)?.color).toBe("dataSeries10")
    expect(lookup.row(1)).toBeUndefined()
    expect(lookup.background(1, AMOUNT)).toBeUndefined()
  })

  it("lets list order decide between a row rule and a cell rule", () => {
    // Given a row rule on amount listed after a row rule on price, and a cell rule
    const rules = [
      rule({
        id: "price-row",
        kind: "value",
        appliesTo: "row",
        condition: { op: "gt", value: 10 },
        color: "dataSeries3",
      }),
      rule({
        id: "amount-row",
        kind: "value",
        target: { kind: "column", name: "amount" },
        appliesTo: "row",
        condition: { op: "gt", value: 0 },
        color: "dataSeries10",
      }),
      rule({
        id: "amount-cell",
        kind: "value",
        target: { kind: "column", name: "amount" },
        appliesTo: "cell",
        condition: { op: "lt", value: 10 },
        color: "dataNegative",
      }),
    ]

    // When both row rules match the same row
    const lookup = evaluate(rules, [row("A", 20, 5)])

    // Then the row rule listed first paints every cell, including amount
    expect(lookup.row(0)?.color).toBe("dataSeries3")
    expect(lookup.background(0, PRICE)?.color).toBe("dataSeries3")
    expect(lookup.background(0, AMOUNT)?.color).toBe("dataSeries3")

    // And with the cell rule moved first, amount keeps its own color and the row fills the rest
    const reordered = evaluate(
      [rules[2], rules[0], rules[1]],
      [row("A", 20, 5)],
    )
    expect(reordered.background(0, AMOUNT)?.color).toBe("dataNegative")
    expect(reordered.background(0, PRICE)?.color).toBe("dataSeries3")
    expect(reordered.row(0)?.color).toBe("dataSeries3")
  })
})

describe("evaluateHighlights: LONG columns as decimal strings", () => {
  const longColumns: ColumnDefinition[] = [
    { name: "symbol", type: "SYMBOL" },
    { name: "volume", type: "LONG" },
  ]
  const VOLUME = 1
  const evaluate = (rules: HighlightRule[], dataset: ResultGridRow[]) =>
    evaluateHighlights({
      columns: longColumns,
      dataset,
      config: config(rules),
      previous: buildIdentityIndex([["A", "50000"]], [SYMBOL]),
    }).lookup

  it("reads string-encoded longs as numbers for steps, comparisons, gradient and movement", () => {
    // Given one rule of each numeric kind on a LONG column
    const target = { kind: "column", name: "volume" } as const
    const steps = rule({
      id: "steps",
      kind: "steps",
      target,
      steps: [{ id: "s", below: 60000, color: "dataNegative" }],
      remainderColor: "dataPositive",
    })
    const above = rule({
      id: "above",
      kind: "value",
      target,
      condition: { op: "gte", value: 60000 },
      color: "dataSeries3",
    })
    const gradient = rule({
      id: "gradient",
      kind: "value",
      target,
      condition: {
        op: "between",
        from: 0,
        to: 64915,
        fill: { kind: "gradient", highColor: "dataSeries9" },
      },
      color: "dataNegative",
    })
    const up = rule({
      id: "up",
      kind: "previous",
      target,
      condition: { op: "gt" },
      color: "dataPositive",
    })

    // When the values arrive as decimal strings
    const rows: ResultGridRow[] = [
      ["A", "50825"],
      ["B", "64915"],
    ]

    // Then every rule kind evaluates them as numbers
    expect(evaluate([steps], rows).background(0, VOLUME)?.color).toBe(
      "dataNegative",
    )
    expect(evaluate([steps], rows).background(1, VOLUME)?.color).toBe(
      "dataPositive",
    )
    expect(evaluate([above], rows).background(0, VOLUME)).toBeUndefined()
    expect(evaluate([above], rows).background(1, VOLUME)?.color).toBe(
      "dataSeries3",
    )
    expect(evaluate([gradient], rows).background(1, VOLUME)?.blend?.ratio).toBe(
      1,
    )
    expect(evaluate([up], rows).background(0, VOLUME)?.color).toBe(
      "dataPositive",
    )
    expect(evaluate([up], rows).direction(0, VOLUME)).toBe("up")
  })
})

describe("evaluateHighlights: steps and gradient fill", () => {
  const evaluate = (rules: HighlightRule[], dataset: ResultGridRow[]) =>
    evaluateHighlights({
      columns,
      dataset,
      config: config(rules, []),
      previous: null,
    }).lookup

  it("picks the first step above the value, else the remainder", () => {
    // Given unsorted steps
    const rules = [
      rule({
        kind: "steps",
        steps: [
          { id: "s2", below: 500, color: "dataSeries2" },
          { id: "s1", below: 100, color: "dataSeries2" },
        ],
        remainderColor: "dataSeries3",
      }),
    ]

    // When evaluated
    const lookup = evaluate(rules, [
      row("A", 50, 1),
      row("A", 200, 1),
      row("A", 500, 1),
    ])

    // Then the steps apply in ascending order
    expect(lookup.background(0, PRICE)?.color).toBe("dataSeries2")
    expect(lookup.background(1, PRICE)?.color).toBe("dataSeries2")
    expect(lookup.background(2, PRICE)?.color).toBe("dataSeries3")
  })

  it("shades a gradient fill by position in the range and clamps beyond it", () => {
    // Given a between rule on price, 0 … 200, red at the low end, green at the high end
    const rules = [
      rule({
        kind: "value",
        condition: {
          op: "between",
          from: 0,
          to: 200,
          fill: { kind: "gradient", highColor: "dataPositive" },
        },
        color: "dataNegative",
      }),
    ]

    // When values sit at the low end, in the middle, above and below the range
    const lookup = evaluate(rules, [
      row("A", 0, 1),
      row("A", 50, 1),
      row("A", 500, 1),
      row("A", -10, 1),
    ])

    // Then the blend ratio follows the position and is clamped at the ends
    expect(lookup.background(0, PRICE)).toEqual({
      color: "dataNegative",
      alpha: 1,
      display: "always",
      blend: { color: "dataPositive", ratio: 0 },
    })
    expect(lookup.background(1, PRICE)?.blend?.ratio).toBe(0.25)
    expect(lookup.background(2, PRICE)?.blend?.ratio).toBe(1)
    expect(lookup.background(3, PRICE)?.blend?.ratio).toBe(0)
  })

  it("leaves a solid between rule as a plain range match", () => {
    // Given the same range with a solid fill
    const rules = [
      rule({
        kind: "value",
        condition: { op: "between", from: 0, to: 200, fill: { kind: "solid" } },
        color: "dataSeries4",
      }),
    ]

    // When a value is outside the range
    const lookup = evaluate(rules, [row("A", 500, 1), row("A", 50, 1)])

    // Then it does not match, and an inside value carries no blend
    expect(lookup.background(0, PRICE)).toBeUndefined()
    expect(lookup.background(1, PRICE)?.blend).toBeUndefined()
  })
})
