import { describe, expect, it } from "vitest"
import { findMatches, type SearchOptions } from "./textSearch"

const literalSource =
  "-- Find patterns with special characters\n" +
  "SELECT * FROM prices WHERE pattern = '^BTC.*$';\n" +
  "INSERT INTO regex_patterns VALUES ('[A-Z]+\\.(ETH|BTC)\\*');\n" +
  "INSERT INTO logs VALUES('Error: File not found at /path/to/file+backup');\n" +
  "CREATE TABLE test_patterns (id INT, email VARCHAR(50) CHECK (email ~ '@.*\\.(com|org)'));\n" +
  "-- Special query: price >= $100 && volume > 1000\n" +
  "SELECT COUNT(*) FROM trades WHERE notes LIKE '%profit: +15.5%';\n"

const words = [
  "Find",
  "product",
  "in",
  "production",
  "PRODUCT",
  "products",
  "Product",
  "testX",
  "text",
  "teXt",
]
const optionCases: {
  options: SearchOptions
  query: string
  indices: number[]
}[] = [
  { options: {}, query: "product", indices: [1, 3, 4, 5, 6] },
  { options: { caseSensitive: true }, query: "product", indices: [1, 3, 5] },
  {
    options: { caseSensitive: true, wholeWord: true },
    query: "product",
    indices: [1],
  },
  { options: { wholeWord: true }, query: "product", indices: [1, 4, 6] },
  {
    options: { useRegex: true, wholeWord: true },
    query: "te[sx]t",
    indices: [8, 9],
  },
  { options: { useRegex: true }, query: "te[sx]t", indices: [7, 8, 9] },
  {
    options: { useRegex: true, caseSensitive: true },
    query: "te[sx]t",
    indices: [7, 8],
  },
  {
    options: { useRegex: true, wholeWord: true, caseSensitive: true },
    query: "te[sx]t",
    indices: [8],
  },
]

describe("literal search", () => {
  it.each([
    ["^BTC.*$", 1],
    ["[A-Z]+", 1],
    ["\\.(ETH|BTC)\\*", 1],
    ["/path/to/file+backup", 1],
    ["price >= $100 && volume", 1],
    ["%profit: +15.5%", 1],
    ["@.*\\.(com|org)", 1],
    ["(email", 1],
    [")", 8],
    ["*", 5],
    [".", 5],
  ] as const)("treats %s as literal text", async (query, count) => {
    // Given
    const options = { useRegex: false }
    // When
    const matches = await findMatches(
      literalSource,
      query,
      options,
      100,
      "literal",
    )
    // Then
    expect(matches).toHaveLength(count)
    for (const match of matches) {
      expect(match.text).toBe(query)
      expect(literalSource.slice(match.startOffset, match.endOffset)).toBe(
        query,
      )
      expect(
        match.previewText.slice(
          match.matchStartInPreview,
          match.matchEndInPreview,
        ),
      ).toBe(query)
    }
  })

  it("finds an email suffix without interpreting its dots", async () => {
    // Given
    const source =
      "SELECT * FROM customer_trades WHERE trader_email = 'john.doe+crypto@trading-firm.com';\n-- near miss: @trading-firmXcom"
    // When
    const matches = await findMatches(
      source,
      "@trading-firm.com",
      {},
      100,
      "email",
    )
    // Then
    expect(matches.map((match) => match.text)).toEqual(["@trading-firm.com"])
    expect(matches[0]).toMatchObject({
      lineNumber: 1,
      column: 68,
      endColumn: 85,
      startOffset: 67,
      endOffset: 84,
    })
  })
})

describe("search option combinations", () => {
  it.each(optionCases)(
    "finds $indices with $options",
    async ({ options, query, indices }) => {
      // Given
      const source = words.join("\n")
      // When
      const matches = await findMatches(source, query, options, 100, "options")
      // Then
      expect(matches.map((match) => match.lineNumber)).toEqual(
        indices.map((index) => index + 1),
      )
      for (const [index, match] of matches.entries()) {
        expect(match.text).toBe(
          words[indices[index]].slice(0, query === "product" ? 7 : 4),
        )
        expect(match.column).toBe(1)
        expect(match.endLineNumber).toBe(indices[index] + 1)
        expect(match.endColumn).toBe(match.text.length + 1)
      }
    },
  )

  it.each(["[invalid-regex", "(unclosed-group"])(
    "rejects the invalid pattern %s",
    async (query) => {
      // Given
      const source = "SELECT symbol FROM trades"
      // When / Then
      await expect(
        findMatches(source, query, { useRegex: true }, 100, "invalid"),
      ).rejects.toThrow()
    },
  )

  it("distinguishes alternation from escaped regex punctuation", async () => {
    // Given
    const source =
      "SELECT price FROM btc_trades;\nSELECT price FROM eth_trades;\nSELECT price FROM ada_trades;"
    // When
    const alternatives = await findMatches(
      source,
      "(btc|eth)_trades",
      { useRegex: true },
      100,
      "alternatives",
    )
    const literal = await findMatches(
      source,
      "\\(btc\\|eth\\)_trades",
      { useRegex: true },
      100,
      "escaped",
    )
    // Then
    expect(alternatives.map((match) => match.text)).toEqual([
      "btc_trades",
      "eth_trades",
    ])
    expect(literal).toEqual([])
  })
})

describe("search coordinates and context", () => {
  it("keeps surrounding context outside the highlighted WHERE token", async () => {
    // Given
    const source = "WHERE trader_email LIKE '%@hedgefund.com'"
    // When
    const [match] = await findMatches(source, "WHERE", {}, 100, "preview")
    // Then
    expect(match.previewText).toBe("WHERE trader_email L...")
    expect(match.matchStartInPreview).toBe(0)
    expect(match.matchEndInPreview).toBe(5)
  })

  it("keeps exact ranges through long content and its final line", async () => {
    // Given
    const lines = Array.from(
      { length: 100 },
      (_, index) =>
        `-- Trading day ${index}: SELECT timestamp, symbol, price, volume FROM trades_${index} WHERE price > (SELECT avg(price) FROM trades_${index});`,
    )
    const source = [
      ...lines,
      "-- Final aggregation: SELECT symbol, vwap(price, volume) FROM all_trades_consolidated GROUP BY symbol",
    ].join("\n")
    // When
    const days = await findMatches(
      source,
      "Trading day \\d+",
      { useRegex: true },
      1000,
      "days",
    )
    const final = await findMatches(
      source,
      "all_trades_consolidated",
      {},
      100,
      "final",
    )
    // Then
    expect(days).toHaveLength(100)
    expect(days[0]).toMatchObject({
      text: "Trading day 0",
      lineNumber: 1,
      column: 4,
      endColumn: 17,
    })
    expect(days[24]).toMatchObject({
      text: "Trading day 24",
      lineNumber: 25,
      column: 4,
      endColumn: 18,
    })
    expect(final).toHaveLength(1)
    expect(final[0]).toMatchObject({
      text: "all_trades_consolidated",
      lineNumber: 101,
      column: 63,
      endColumn: 86,
    })
  })
})
