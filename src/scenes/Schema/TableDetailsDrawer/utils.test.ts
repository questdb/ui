import { describe, it, expect } from "vitest"
import { extractStoragePolicyClauses, formatTTL } from "./utils"

describe("formatTTL", () => {
  it("returns None for a value of 0", () => {
    expect(formatTTL(0, "HOURS")).toBe("None")
  })

  it("returns None when the server omits the ttl columns", () => {
    // Given a server older than 8.2.2, whose tables() has no ttl columns
    expect(formatTTL(undefined, undefined)).toBe("None")
  })

  it("uses a singular Title Case unit for a value of 1", () => {
    // Given the server reports the unit as either singular or plural
    // Then a value of 1 always renders with a singular unit
    expect(formatTTL(1, "MONTHS")).toBe("1 Month")
    expect(formatTTL(1, "MONTH")).toBe("1 Month")
    expect(formatTTL(1, "HOURS")).toBe("1 Hour")
  })

  it("uses a plural Title Case unit for values other than 1", () => {
    // Given the server reports the unit as either singular or plural
    // Then any value other than 1 always renders with a plural unit
    expect(formatTTL(3, "MONTH")).toBe("3 Months")
    expect(formatTTL(3, "MONTHS")).toBe("3 Months")
    expect(formatTTL(2, "YEAR")).toBe("2 Years")
  })
})

describe("extractStoragePolicyClauses", () => {
  it("returns an empty array when the DDL has no storage policy", () => {
    const ddl = `CREATE TABLE 'trades' (
      symbol SYMBOL, price DOUBLE, ts TIMESTAMP
    ) timestamp(ts) PARTITION BY DAY;`
    expect(extractStoragePolicyClauses(ddl)).toEqual([])
  })

  it("returns an empty array for unparseable DDL", () => {
    expect(extractStoragePolicyClauses("not a valid sql statement")).toEqual([])
  })

  it("returns an empty array for an empty string", () => {
    expect(extractStoragePolicyClauses("")).toEqual([])
  })

  it("extracts a single clause with a plural unit", () => {
    const ddl = `CREATE TABLE 'trades' (price DOUBLE, ts TIMESTAMP)
      timestamp(ts) PARTITION BY DAY
      STORAGE POLICY(TO PARQUET 3 DAYS);`
    expect(extractStoragePolicyClauses(ddl)).toEqual([
      { action: "To Parquet", duration: "3 Days" },
    ])
  })

  it("normalizes a value of 1 to a singular unit", () => {
    const ddl = `CREATE TABLE 'trades' (price DOUBLE, ts TIMESTAMP)
      timestamp(ts) PARTITION BY DAY
      STORAGE POLICY(TO PARQUET 1 DAYS);`
    expect(extractStoragePolicyClauses(ddl)).toEqual([
      { action: "To Parquet", duration: "1 Day" },
    ])
  })

  it("extracts all clauses in pipeline order", () => {
    const ddl = `CREATE TABLE 'trades' (price DOUBLE, ts TIMESTAMP)
      timestamp(ts) PARTITION BY DAY
      STORAGE POLICY(TO PARQUET 1 DAYS, TO REMOTE 10 DAYS, DROP LOCAL 1 MONTHS, DROP REMOTE 2 YEARS);`
    expect(extractStoragePolicyClauses(ddl)).toEqual([
      { action: "To Parquet", duration: "1 Day" },
      { action: "To Remote", duration: "10 Days" },
      { action: "Drop Local", duration: "1 Month" },
      { action: "Drop Remote", duration: "2 Years" },
    ])
  })

  it("returns an empty array for the retired DROP NATIVE syntax", () => {
    // Given a DDL from a pre-release server build that still emits the
    // removed DROP NATIVE stage — the parse failure deliberately degrades
    // to "no clauses" rather than an error
    const ddl = `CREATE TABLE 'trades' (price DOUBLE, ts TIMESTAMP)
      timestamp(ts) PARTITION BY DAY
      STORAGE POLICY(TO PARQUET 3 DAYS, DROP NATIVE 10 DAYS);`
    expect(extractStoragePolicyClauses(ddl)).toEqual([])
  })

  it("extracts TO PARQUET + TO REMOTE with a trailing OWNED BY (reported repro)", () => {
    // Given the reported DDL whose TO REMOTE clause used to fail the parse
    const ddl = `CREATE TABLE 'corporate_bonds' (
      ts TIMESTAMP, isin SYMBOL, price DOUBLE
    ) timestamp(ts) PARTITION BY DAY
    STORAGE POLICY(TO PARQUET 3 DAYS, TO REMOTE 30 DAYS)
    OWNED BY 'admin';`
    // Then both stages render instead of an empty "Not configured" section
    expect(extractStoragePolicyClauses(ddl)).toEqual([
      { action: "To Parquet", duration: "3 Days" },
      { action: "To Remote", duration: "30 Days" },
    ])
  })
})
