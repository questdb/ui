import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import {
  formatBytes,
  formatCompactElapsedDuration,
  formatElapsedDuration,
  formatMicrosDuration,
  formatUtcTimestamp,
} from "./format"

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

describe("formatElapsedDuration", () => {
  beforeAll(() => {
    vi.stubGlobal("navigator", { languages: ["en-US"], language: "en-US" })
  })

  afterAll(() => {
    vi.unstubAllGlobals()
  })

  it("spells out minutes and seconds", () => {
    expect(formatElapsedDuration(156_000)).toBe("2 minutes 36 seconds")
  })

  it("includes hours for long-running queries", () => {
    expect(formatElapsedDuration(3_723_000)).toBe("1 hour 2 minutes 3 seconds")
  })

  it("describes sub-second values", () => {
    expect(formatElapsedDuration(400)).toBe("less than a second")
  })
})

describe("formatCompactElapsedDuration", () => {
  it.each([
    [-100, "<1s"],
    [999, "<1s"],
    [1_000, "1s"],
    [59_999, "59s"],
    [60_000, "1m 0s"],
    [154_000, "2m 34s"],
    [3_600_000, "1h 0m"],
    [3_723_000, "1h 2m"],
    [86_400_000, "1d 0h"],
    [90_000_000, "1d 1h"],
  ])("formats %i milliseconds as %s", (elapsedMs, expected) => {
    expect(formatCompactElapsedDuration(elapsedMs)).toBe(expected)
  })
})
