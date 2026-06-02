import { describe, it, expect } from "vitest"
import { extractStoragePolicyClauses } from "./utils"

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
      STORAGE POLICY(TO PARQUET 1 DAYS, DROP NATIVE 10 DAYS, DROP LOCAL 1 MONTHS, DROP REMOTE 2 YEARS);`
    expect(extractStoragePolicyClauses(ddl)).toEqual([
      { action: "To Parquet", duration: "1 Day" },
      { action: "Drop Native", duration: "10 Days" },
      { action: "Drop Local", duration: "1 Month" },
      { action: "Drop Remote", duration: "2 Years" },
    ])
  })
})
