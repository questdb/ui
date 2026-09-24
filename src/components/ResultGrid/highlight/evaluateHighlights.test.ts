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
        condition: { op: "between", from: 10, to: 20 },
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

    // Then the breaching row is colored as a whole, its cells carry no own color
    expect(lookup.row(0)).toEqual({
      color: "dataSeries10",
      alpha: 1,
      display: "always",
    })
    expect(lookup.background(0, AMOUNT)).toBeUndefined()
    expect(lookup.background(0, SYMBOL)).toBeUndefined()
    expect(lookup.row(1)).toBeUndefined()
  })

  it("keeps a cell rule on top of a row rule and lets list order pick the row color", () => {
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

    // Then the rule listed first colors the row and the amount cell keeps its own color
    expect(lookup.row(0)?.color).toBe("dataSeries3")
    expect(lookup.background(0, PRICE)).toBeUndefined()
    expect(lookup.background(0, AMOUNT)).toBeUndefined()

    // And with the row rule on amount moved first, amount still matches its row rule first
    const reordered = evaluate(
      [rules[2], rules[0], rules[1]],
      [row("A", 20, 5)],
    )
    expect(reordered.background(0, AMOUNT)?.color).toBe("dataNegative")
    expect(reordered.row(0)?.color).toBe("dataSeries3")
  })
})

describe("evaluateHighlights: steps and gradient", () => {
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

  it("scales alpha per column with an automatic max", () => {
    // Given one gradient over all numeric columns
    const rules = [
      rule({
        kind: "gradient",
        target: { kind: "allNumeric" },
        max: "auto",
        negativeColor: "dataNegative",
        positiveColor: "dataPositive",
      }),
    ]

    // When price ranges to 200 and amount to 10
    const lookup = evaluate(rules, [
      row("A", -100, 5),
      row("A", 200, 10),
      row("A", 0, 0),
    ])

    // Then each column uses its own max and zero has no color
    expect(lookup.background(0, PRICE)).toEqual({
      color: "dataNegative",
      alpha: 0.5,
      display: "always",
    })
    expect(lookup.background(0, AMOUNT)?.alpha).toBe(0.5)
    expect(lookup.background(1, PRICE)?.alpha).toBe(1)
    expect(lookup.background(2, PRICE)).toBeUndefined()
  })

  it("clamps values above a fixed max", () => {
    // Given a fixed max of 10
    const rules = [
      rule({
        kind: "gradient",
        max: 10,
        negativeColor: "dataNegative",
        positiveColor: "dataPositive",
      }),
    ]

    // When a value exceeds it
    const lookup = evaluate(rules, [row("A", 25, 1)])

    // Then alpha stays at 1
    expect(lookup.background(0, PRICE)?.alpha).toBe(1)
  })
})
