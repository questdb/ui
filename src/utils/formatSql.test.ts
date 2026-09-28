import "../test/stubBrowserGlobals"
import { beforeEach, describe, expect, it } from "vitest"
import { formatSql, normalizeSql } from "./formatSql"
import { StoreKey } from "./localStorage/types"

const QUERY =
  "select symbol, count() from trades where price > 10 group by symbol"

beforeEach(() => {
  localStorage.clear()
})

describe("formatSql", () => {
  it("keeps keyword case when the capitalize setting is off", () => {
    // Given
    localStorage.setItem(StoreKey.CAPITALIZE_KEYWORDS_ON_FORMAT, "false")

    // When
    const formatted = formatSql(QUERY)

    // Then
    expect(formatted).toBe(
      "select symbol, count()\nfrom trades\nwhere price > 10\ngroup by symbol",
    )
  })

  it("uppercases keywords and keeps identifiers when the capitalize setting is on", () => {
    // Given
    localStorage.setItem(StoreKey.CAPITALIZE_KEYWORDS_ON_FORMAT, "true")

    // When
    const formatted = formatSql(QUERY)

    // Then
    expect(formatted).toBe(
      "SELECT symbol, count()\nFROM trades\nWHERE price > 10\nGROUP BY symbol",
    )
  })

  it("lets an explicit capitalize option override the setting", () => {
    // Given
    localStorage.setItem(StoreKey.CAPITALIZE_KEYWORDS_ON_FORMAT, "true")

    // When
    const formatted = formatSql("select a from t", { capitalize: false })

    // Then
    expect(formatted).toBe("select a\nfrom t")
  })
})

describe("normalizeSql", () => {
  it("returns an empty string for empty input", () => {
    expect(normalizeSql("")).toBe("")
  })

  it("replaces a trailing semicolon with a single one after formatting", () => {
    // Given
    const sql = "  select a from t;  "

    // When
    const normalized = normalizeSql(sql)

    // Then
    expect(normalized).toBe("select a\nfrom t;")
  })

  it("omits the semicolon when asked", () => {
    // Given
    const sql = "select a from t;"

    // When
    const normalized = normalizeSql(sql, false)

    // Then
    expect(normalized).toBe("select a\nfrom t")
  })
})
