import { describe, it, expect } from "vitest"
import {
  formatStoragePolicyClauses,
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
import type { StoragePolicy } from "../../../utils/questdb/types"

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

describe("formatStoragePolicyClauses", () => {
  const policy: StoragePolicy = {
    table_dir_name: "trades~1",
    to_parquet: "24h",
    to_remote: "168h",
    drop_local: "2160h",
    drop_remote: "1m",
    status: "A",
    last_updated: "2026-09-01T00:00:00.000000Z",
  }

  it("formats the catalog durations in pipeline order", () => {
    // Given / When / Then
    expect(formatStoragePolicyClauses(policy)).toEqual([
      { action: "To Parquet", duration: "1 Day" },
      { action: "To Remote", duration: "1 Week" },
      { action: "Drop Local", duration: "90 Days" },
      { action: "Drop Remote", duration: "1 Month" },
    ])
  })

  it("omits stages that the catalog reports as zero", () => {
    // Given
    const policyWithoutOptionalStages = {
      ...policy,
      to_remote: "0h",
      drop_local: "0h",
      drop_remote: "0h",
    }

    // When / Then
    expect(formatStoragePolicyClauses(policyWithoutOptionalStages)).toEqual([
      { action: "To Parquet", duration: "1 Day" },
    ])
  })

  it("formats complete years that the catalog reports as months", () => {
    // Given
    const policyWithYear = { ...policy, drop_remote: "12m" }

    // When / Then
    expect(formatStoragePolicyClauses(policyWithYear)).toContainEqual({
      action: "Drop Remote",
      duration: "1 Year",
    })
  })

  it("returns no clauses when the table has no policy row", () => {
    // Given / When / Then
    expect(formatStoragePolicyClauses(null)).toEqual([])
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
