import { describe, expect, it } from "vitest"
import {
  applyRegex,
  dedupeOptions,
  parseCustomEntries,
  sortOptions,
} from "./listOptions"

const options = (...values: string[]) =>
  values.map((value) => ({ value, label: value }))

describe("parseCustomEntries", () => {
  it("reads plain values and values with an alias in either case", () => {
    // Given
    const entries = "'EURUSD', 'GBPUSD' as Cable ,, 'USDJPY' AS \"Yen pair\""

    // When
    const parsed = parseCustomEntries(entries)

    // Then
    expect(parsed).toEqual([
      { value: "'EURUSD'", label: "'EURUSD'" },
      { value: "'GBPUSD'", label: "Cable" },
      { value: "'USDJPY'", label: "Yen pair" },
    ])
  })

  it("normalizes whitespace outside quotes and keeps it inside", () => {
    // Given
    const entries = "  'EURUSD'\n as   Euro , 'A  B'\t,  now( )  "

    // When
    const parsed = parseCustomEntries(entries)

    // Then
    expect(parsed).toEqual([
      { value: "'EURUSD'", label: "Euro" },
      { value: "'A  B'", label: "'A  B'" },
      { value: "now( )", label: "now( )" },
    ])
  })

  it("keeps commas and the word as inside quotes", () => {
    expect(parseCustomEntries("'a, b' as 'x as y', 'as'")).toEqual([
      { value: "'a, b'", label: "x as y" },
      { value: "'as'", label: "'as'" },
    ])
  })
})

describe("applyRegex", () => {
  it("filters when the pattern has no groups", () => {
    expect(applyRegex(options("EURUSD", "GBPJPY", "AUDUSD"), "USD$")).toEqual(
      options("EURUSD", "AUDUSD"),
    )
  })

  it("extracts the first group as the value", () => {
    expect(applyRegex(options("EURUSD", "GBPJPY"), "/^(\\w{3})/")).toEqual(
      options("EUR", "GBP"),
    )
  })

  it("maps named text and value groups", () => {
    // Given
    const pattern = "^(?<text>\\w{3})(?<value>\\w{3})$"

    // When
    const mapped = applyRegex(options("EURUSD"), pattern)

    // Then
    expect(mapped).toEqual([{ value: "USD", label: "EUR" }])
  })

  it("leaves options untouched for an invalid pattern", () => {
    expect(applyRegex(options("a"), "(")).toEqual(options("a"))
  })
})

describe("dedupeOptions", () => {
  it("keeps the first label for a repeated value", () => {
    // Given
    const repeated = [
      { value: "1", label: "one" },
      { value: "1", label: "uno" },
      { value: "2", label: "two" },
    ]

    // When
    const deduped = dedupeOptions(repeated)

    // Then
    expect(deduped).toEqual([
      { value: "1", label: "one" },
      { value: "2", label: "two" },
    ])
  })
})

describe("sortOptions", () => {
  it("sorts numerically by value and alphabetically by label", () => {
    expect(sortOptions(options("10", "9", "100"), "numAsc")).toEqual(
      options("9", "10", "100"),
    )
    expect(sortOptions(options("b", "a", "c"), "alphaDesc")).toEqual(
      options("c", "b", "a"),
    )
    expect(sortOptions(options("b", "a"), "none")).toEqual(options("b", "a"))
  })
})
