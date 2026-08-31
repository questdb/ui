import { describe, it, expect } from "vitest"
import {
  extractStoragePolicyClauses,
  formatBytes,
  formatInterval,
  formatMicrosDuration,
  formatRowCount,
  formatTTL,
  formatTxnCount,
  formatUtcTimestamp,
  getTrendSamplesForIssue,
} from "./utils"
import type { TrendData } from "./healthCheck"

const digitsOf = (formatted: string) => formatted.replace(/\D/g, "")

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

describe("formatInterval", () => {
  it("returns None for a zero value or a missing unit", () => {
    expect(formatInterval(BigInt(0), "SECONDS")).toBe("None")
    expect(formatInterval(BigInt(5), "")).toBe("None")
  })

  it("uses a singular Title Case unit for a value of 1", () => {
    expect(formatInterval(BigInt(1), "SECONDS")).toBe("1 Second")
    expect(formatInterval(BigInt(1), "SECOND")).toBe("1 Second")
  })

  it("uses a plural Title Case unit for values other than 1", () => {
    expect(formatInterval(BigInt(5), "SECOND")).toBe("5 Seconds")
    expect(formatInterval(BigInt(2), "MINUTES")).toBe("2 Minutes")
  })
})

describe("formatUtcTimestamp", () => {
  it("drops an all-zero fraction for a compact UTC string", () => {
    expect(formatUtcTimestamp("2026-08-24T10:31:00.000000Z")).toBe(
      "2026-08-24 10:31:00 UTC",
    )
  })

  it("keeps the microsecond precision the server sends", () => {
    // Given a START FROM NOW boundary resolved mid-second on the server
    expect(formatUtcTimestamp("2026-08-25T13:00:00.472913Z")).toBe(
      "2026-08-25 13:00:00.472913 UTC",
    )
  })

  it("trims trailing zeros from the fraction", () => {
    expect(formatUtcTimestamp("2026-08-25T13:00:00.472000Z")).toBe(
      "2026-08-25 13:00:00.472 UTC",
    )
  })

  it("returns the raw value when the timestamp does not parse", () => {
    expect(formatUtcTimestamp("not a timestamp")).toBe("not a timestamp")
  })
})

describe("formatTxnCount", () => {
  it("should render Unknown for a null count", () => {
    expect(formatTxnCount(null)).toBe("Unknown")
  })

  it("should use the singular unit for a count of 1", () => {
    expect(formatTxnCount(BigInt(1))).toBe("1 txn")
  })

  it("should use the plural unit and the viewer's locale grouping", () => {
    expect(formatTxnCount(BigInt(0))).toBe("0 txns")
    expect(formatTxnCount(BigInt(1500))).toBe(`${(1500).toLocaleString()} txns`)
  })

  it("should preserve unsafe LONG values", () => {
    // Given a LONG above Number.MAX_SAFE_INTEGER, whatever the viewer's locale
    const unsafeLong = BigInt("9007199254740993")

    // Then every digit survives the formatting
    expect(digitsOf(formatTxnCount(unsafeLong))).toBe("9007199254740993")
    expect(digitsOf(formatRowCount(unsafeLong))).toBe("9007199254740993")
  })
})

describe("formatMicrosDuration", () => {
  it("renders sub-second values as rounded milliseconds", () => {
    expect(formatMicrosDuration(BigInt(0))).toBe("0 ms")
    expect(formatMicrosDuration(BigInt(2_500))).toBe("3 ms")
    expect(formatMicrosDuration(BigInt(999_999))).toBe("1000 ms")
  })

  it("renders sub-minute values as seconds with one decimal", () => {
    expect(formatMicrosDuration(BigInt(1_000_000))).toBe("1.0 s")
    expect(formatMicrosDuration(BigInt(2_500_000))).toBe("2.5 s")
  })

  it("renders sub-hour values as minutes with one decimal", () => {
    expect(formatMicrosDuration(BigInt(60_000_000))).toBe("1.0 min")
    expect(formatMicrosDuration(BigInt(90_000_000))).toBe("1.5 min")
  })

  it("renders values of an hour and above as hours with one decimal", () => {
    expect(formatMicrosDuration(BigInt(3_600_000_000))).toBe("1.0 h")
    expect(formatMicrosDuration(BigInt(5_400_000_000))).toBe("1.5 h")
  })
})

describe("formatBytes", () => {
  it("renders values under one KiB as bytes", () => {
    expect(formatBytes(BigInt(0))).toBe("0 B")
    expect(formatBytes(BigInt(1023))).toBe("1023 B")
  })

  it("renders values under one MiB as KiB with one decimal", () => {
    expect(formatBytes(BigInt(1024))).toBe("1.0 KiB")
    expect(formatBytes(BigInt(1536))).toBe("1.5 KiB")
  })

  it("renders values under one GiB as MiB with one decimal", () => {
    expect(formatBytes(BigInt(1024 ** 2))).toBe("1.0 MiB")
    expect(formatBytes(BigInt(8_388_608))).toBe("8.0 MiB")
  })

  it("renders values of one GiB and above as GiB with one decimal", () => {
    expect(formatBytes(BigInt(1024 ** 3))).toBe("1.0 GiB")
    expect(formatBytes(BigInt(1024 ** 3 * 1.5))).toBe("1.5 GiB")
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

describe("getTrendSamplesForIssue", () => {
  const trendData: TrendData = {
    walPendingRowCount: [{ value: BigInt(1), timestamp: 1 }],
    transactionLag: [{ value: BigInt(2), timestamp: 2 }],
    ingestionMetric: [{ value: BigInt(3), timestamp: 3 }],
  }

  it("should return the matching series for every field that has a trend", () => {
    // Given / When / Then
    expect(getTrendSamplesForIssue("transactionLag", trendData)).toBe(
      trendData.transactionLag,
    )
    expect(getTrendSamplesForIssue("pendingRows", trendData)).toBe(
      trendData.walPendingRowCount,
    )
  })

  it("should return undefined for a field with no trend series", () => {
    // Given / When / Then
    expect(getTrendSamplesForIssue("writerStall", trendData)).toBeUndefined()
    expect(getTrendSamplesForIssue("viewStatus", trendData)).toBeUndefined()
  })
})
