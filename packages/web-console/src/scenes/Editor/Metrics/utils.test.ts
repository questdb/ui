// TZ = UTC in Jest config

import {
  getAutoRefreshRate,
  getXAxisFormat,
  sqlValueToFixed,
  formatNumbers,
  formatSamplingRate,
  formatToISOIfNeeded,
  getSamplingRateForPeriod,
  hasData,
  isDateToken,
  durationToHumanReadable,
} from "./utils"

describe("getAutoRefreshRate", () => {
  it("should set a correct auto refresh rate for relative periods", () => {
    expect(getAutoRefreshRate("now-5m", "now")).toBe("5s")
    expect(getAutoRefreshRate("now-15m", "now")).toBe("5s")
    expect(getAutoRefreshRate("now-1h", "now")).toBe("10s")
    expect(getAutoRefreshRate("now-3h", "now")).toBe("30s")
    expect(getAutoRefreshRate("now-6h", "now")).toBe("30s")
    expect(getAutoRefreshRate("now-12h", "now")).toBe("30s")
    expect(getAutoRefreshRate("now-24h", "now")).toBe("30s")
    expect(getAutoRefreshRate("now-3d", "now")).toBe("1m")
    expect(getAutoRefreshRate("now-7d", "now")).toBe("1m")
  })

  it("should set a correct auto refresh rate for absolute periods", () => {
    expect(
      getAutoRefreshRate("2025-01-01T00:00:00Z", "2025-01-01T00:05:00Z"),
    ).toBe("5s")
    expect(
      getAutoRefreshRate("2025-01-01T00:00:00Z", "2025-01-01T00:15:00Z"),
    ).toBe("5s")
    expect(
      getAutoRefreshRate("2025-01-01T00:00:00Z", "2025-01-01T01:00:00Z"),
    ).toBe("10s")
    expect(
      getAutoRefreshRate("2025-01-01T00:00:00Z", "2025-01-01T03:00:00Z"),
    ).toBe("30s")
    expect(
      getAutoRefreshRate("2025-01-01T00:00:00Z", "2025-01-01T06:00:00Z"),
    ).toBe("30s")
    expect(
      getAutoRefreshRate("2025-01-01T00:00:00Z", "2025-01-01T12:00:00Z"),
    ).toBe("30s")
    expect(
      getAutoRefreshRate("2025-01-01T00:00:00Z", "2025-01-02T00:00:00Z"),
    ).toBe("30s")
    expect(
      getAutoRefreshRate("2025-01-01T00:00:00Z", "2025-01-04T00:00:00Z"),
    ).toBe("1m")
    expect(
      getAutoRefreshRate("2025-01-01T00:00:00Z", "2025-01-08T00:00:00Z"),
    ).toBe("1m")
  })
})

describe("getXAxisFormat", () => {
  it("should return correct format of X axis values for periods", () => {
    const tickValue = new Date("2025-01-01T00:00:00Z").getTime()
    expect(
      getXAxisFormat(
        tickValue,
        new Date("2025-01-01T00:00:00Z").getTime(),
        new Date("2025-01-01T00:00:59Z").getTime(),
      ),
    ).toBe("00:00:00")
    expect(
      getXAxisFormat(
        tickValue,
        new Date("2025-01-01T00:00:00Z").getTime(),
        new Date("2025-01-01T00:59:59Z").getTime(),
      ),
    ).toBe("00:00")
    expect(
      getXAxisFormat(
        tickValue,
        new Date("2025-01-01T00:00:00Z").getTime(),
        new Date("2025-01-01T23:59:59Z").getTime(),
      ),
    ).toBe("00:00")
    expect(
      getXAxisFormat(
        tickValue,
        new Date("2025-01-01T00:00:00Z").getTime(),
        new Date("2025-01-02T00:00:00Z").getTime(),
      ),
    ).toBe("01/01")
  })
})

describe("sqlValueToFixed", () => {
  it("should return a fixed number with 0 decimal points from string", () => {
    expect(sqlValueToFixed("1")).toBe(1)
    expect(sqlValueToFixed("1.0")).toBe(1)
  })

  it("should return a fixed number with 2 decimal points from string", () => {
    expect(sqlValueToFixed("1.234567")).toBe(1.23)
    expect(sqlValueToFixed("1.235567")).toBe(1.24)
  })
})

describe("formatNumbers", () => {
  it("should format numbers with M and K or return unchanged", () => {
    expect(formatNumbers(1e6)).toBe("1 M")
    expect(formatNumbers(1e6 + 1)).toBe("1 M")
    expect(formatNumbers(1e6 + 1e5)).toBe("1.1 M")
    expect(formatNumbers(1e3)).toBe("1 k")
    expect(formatNumbers(1e3 + 1)).toBe("1 k")
    expect(formatNumbers(1e3 + 1e2)).toBe("1.1 k")
    expect(formatNumbers(999)).toBe("999")
  })
})

describe("formatSamplingRate", () => {
  it("should format sampling rate in seconds, minutes and hours", () => {
    expect(formatSamplingRate(3600)).toBe("1h")
    expect(formatSamplingRate(3600 + 1)).toBe("1h")
    expect(formatSamplingRate(3600 + 60)).toBe("1h")
    expect(formatSamplingRate(60)).toBe("1m")
    expect(formatSamplingRate(60 + 1)).toBe("1m")
    expect(formatSamplingRate(60 + 1)).toBe("1m")
    expect(formatSamplingRate(1)).toBe("1s")
    expect(formatSamplingRate(1 + 1)).toBe("2s")
  })
})

describe("fomratToISOIfNeeded", () => {
  it("should format Date to ISO string", () => {
    expect(formatToISOIfNeeded(new Date("2025-01-01T01:00:00+01:00"))).toBe(
      "2025-01-01T00:00:00Z",
    )
    expect(formatToISOIfNeeded(new Date("2025-01-01"))).toBe(
      "2025-01-01T00:00:00Z",
    )
  })
})

describe("getSamplingRateForPeriod", () => {
  it("should return correct sampling rate for periods", () => {
    // 5min
    expect(
      getSamplingRateForPeriod("2025-01-01T00:00:00Z", "2025-01-01T00:05:00Z"),
    ).toBe(1)
    // 15min
    expect(
      getSamplingRateForPeriod("2025-01-01T00:00:00Z", "2025-01-01T00:15:00Z"),
    ).toBe(2)
    // 1h
    expect(
      getSamplingRateForPeriod("2025-01-01T00:00:00Z", "2025-01-01T01:00:00Z"),
    ).toBe(10)
    // 12h
    expect(
      getSamplingRateForPeriod("2025-01-01T00:00:00Z", "2025-01-01T12:00:00Z"),
    ).toBe(75)
    // 24h
    expect(
      getSamplingRateForPeriod("2025-01-01T00:00:00Z", "2025-01-01T23:59:59Z"),
    ).toBe(180)
    // 3d
    expect(
      getSamplingRateForPeriod("2025-01-01T00:00:00Z", "2025-01-03T23:59:59Z"),
    ).toBe(600)
    // 7d
    expect(
      getSamplingRateForPeriod("2025-01-01T00:00:00Z", "2025-01-07T23:59:59Z"),
    ).toBe(1200)
  })
})

describe("hasData", () => {
  it("should detect if uplot aligned dataset has datapoints", () => {
    expect(hasData([[], []])).toBe(false)
    expect(hasData([[1], [1]])).toBe(true)
    expect(
      hasData([
        [1, 2, 3],
        [1, null, 3],
      ]),
    ).toBe(true)
  })
})

describe("isDateToken", () => {
  it("should detect if a string is a date token", () => {
    expect(isDateToken("now")).toBe(true)
    expect(isDateToken("now-5m")).toBe(true)
    expect(isDateToken("now-5h")).toBe(true)
    expect(isDateToken("now-5d")).toBe(true)
    expect(isDateToken("now-")).toBe(false)
    expect(isDateToken("now-m")).toBe(false)
  })
})

describe("durationToHumanReadable", () => {
  it("should display relative periods in human readable form", () => {
    expect(durationToHumanReadable("now-5m", "now")).toBe("Last 5m")
    expect(durationToHumanReadable("now-15m", "now")).toBe("Last 15m")
    expect(durationToHumanReadable("now-1h", "now")).toBe("Last 1h")
    expect(durationToHumanReadable("now-3h", "now")).toBe("Last 3h")
    expect(durationToHumanReadable("now-6h", "now")).toBe("Last 6h")
    expect(durationToHumanReadable("now-12h", "now")).toBe("Last 12h")
    expect(durationToHumanReadable("now-24h", "now")).toBe("Last 24h")
    expect(durationToHumanReadable("now-3d", "now")).toBe("Last 3 days")
    expect(durationToHumanReadable("now-7d", "now")).toBe("Last 7 days")
  })

  it("should display absolute periods in the predefined form", () => {
    expect(
      durationToHumanReadable("2025-01-01T00:00:00Z", "2025-01-01T00:05:00Z"),
    ).toContain("2025-01-01 00:00:00 - 2025-01-01 00:05:00")
  })
})
