import { describe, it, expect } from "vitest"
import {
  calculateHealthStatus,
  calculateTrendRate,
  getTrendDirection,
  detectIngestionActive,
  isLiveViewLoadFailure,
  type TimestampedSample,
  type TrendData,
} from "./healthCheck"
import type {
  LiveView,
  MaterializedView,
  Table,
} from "../../../utils/questdb/types"
import type { TableKindData } from "./types"

const ready = <T>(data: T) => ({ status: "ready" as const, data })
const loading = { status: "loading" } as const

describe("isLiveViewLoadFailure", () => {
  it.each(["version_unsupported", "state_unreadable"] as const)(
    "should detect the %s load-failure state",
    (viewStatus) => {
      // Given
      const liveView = { view_status: viewStatus } as LiveView

      // When
      const result = isLiveViewLoadFailure(liveView)

      // Then
      expect(result).toBe(true)
    },
  )

  it.each(["active", "invalid"] as const)(
    "should keep diagnostics available for the %s state",
    (viewStatus) => {
      // Given
      const liveView = { view_status: viewStatus } as LiveView

      // When
      const result = isLiveViewLoadFailure(liveView)

      // Then
      expect(result).toBe(false)
    },
  )
})

const makeSamples = (
  values: number[],
  intervalMs: number = 1000,
  startTime: number = 0,
): TimestampedSample[] => {
  return values.map((value, i) => ({
    value: BigInt(value),
    timestamp: startTime + i * intervalMs,
  }))
}

describe("calculateTrendRate", () => {
  it("should return 0 for less than 2 samples", () => {
    expect(calculateTrendRate([], 0)).toBe(0)
    expect(calculateTrendRate([{ value: BigInt(100), timestamp: 0 }], 0)).toBe(
      0,
    )
  })

  it("should calculate positive slope for increasing values", () => {
    // 0 -> 100 -> 200 over 2 seconds = 100 units/sec
    const samples = makeSamples([0, 100, 200], 1000, 0)
    expect(calculateTrendRate(samples, 2000)).toBeCloseTo(100)
  })

  it("should calculate negative slope for decreasing values", () => {
    // 200 -> 100 -> 0 over 2 seconds = -100 units/sec
    const samples = makeSamples([200, 100, 0], 1000, 0)
    expect(calculateTrendRate(samples, 2000)).toBeCloseTo(-100)
  })

  it("should return 0 for constant values", () => {
    const samples = makeSamples([100, 100, 100, 100], 1000, 0)
    expect(calculateTrendRate(samples, 3000)).toBe(0)
  })

  it("should preserve deltas between unsafe LONG values", () => {
    const base = BigInt("9007199254740992")
    const samples: TimestampedSample[] = [0, 1, 2, 3, 4].map((i) => ({
      value: base + BigInt(i),
      timestamp: i * 1000,
    }))

    expect(calculateTrendRate(samples, 4000)).toBeCloseTo(1)
  })

  it("should handle noisy data and find overall trend", () => {
    // [100, 150, 120, 180, 150] over 8 seconds - overall increasing
    const samples = [
      { value: BigInt(100), timestamp: 0 },
      { value: BigInt(150), timestamp: 2000 },
      { value: BigInt(120), timestamp: 4000 },
      { value: BigInt(180), timestamp: 6000 },
      { value: BigInt(150), timestamp: 8000 },
    ]
    const rate = calculateTrendRate(samples, 8000)
    // Should detect overall positive trend
    expect(rate).toBeGreaterThan(0)
  })

  it("should detect recovery after spike", () => {
    // [0, 100, 200, 100, 5] - spike then recovery
    const samples = [
      { value: BigInt(0), timestamp: 0 },
      { value: BigInt(100), timestamp: 2000 },
      { value: BigInt(200), timestamp: 4000 },
      { value: BigInt(100), timestamp: 6000 },
      { value: BigInt(5), timestamp: 8000 },
    ]
    const rate = calculateTrendRate(samples, 8000)
    // Linear regression gives small positive slope (~0.625) due to math
    // The key is that it's close to 0, not strongly trending
    expect(Math.abs(rate)).toBeLessThan(5)
  })

  it("should only consider samples within 30-second window", () => {
    const now = 60000 // 60 seconds
    const samples = [
      { value: BigInt(1000), timestamp: 0 }, // 60s ago - should be excluded
      { value: BigInt(900), timestamp: 10000 }, // 50s ago - should be excluded
      { value: BigInt(100), timestamp: 35000 }, // 25s ago - included
      { value: BigInt(200), timestamp: 45000 }, // 15s ago - included
      { value: BigInt(300), timestamp: 55000 }, // 5s ago - included
    ]
    const rate = calculateTrendRate(samples, now)
    // Only last 3 samples within 30s window: 100 -> 200 -> 300 over 20s = 10/s
    expect(rate).toBeCloseTo(10)
  })

  it("should handle single sample within window", () => {
    const now = 60000
    const samples = [
      { value: BigInt(1000), timestamp: 0 }, // 60s ago - excluded
      { value: BigInt(500), timestamp: 50000 }, // 10s ago - only sample in window
    ]
    // Only one sample in window, need 2+ for regression
    expect(calculateTrendRate(samples, now)).toBe(0)
  })
})

describe("getTrendDirection", () => {
  it("should return increasing for positive rate above threshold", () => {
    expect(getTrendDirection(1)).toBe("increasing")
    expect(getTrendDirection(100)).toBe("increasing")
  })

  it("should return decreasing for negative rate below threshold", () => {
    expect(getTrendDirection(-1)).toBe("decreasing")
    expect(getTrendDirection(-100)).toBe("decreasing")
  })

  it("should return stable for rate within threshold", () => {
    expect(getTrendDirection(0)).toBe("stable")
    expect(getTrendDirection(0.4)).toBe("stable")
    expect(getTrendDirection(-0.4)).toBe("stable")
    expect(getTrendDirection(0.5)).toBe("stable") // exactly at threshold
    expect(getTrendDirection(-0.5)).toBe("stable") // exactly at threshold
  })

  it("should return increasing/decreasing just above threshold", () => {
    expect(getTrendDirection(0.51)).toBe("increasing")
    expect(getTrendDirection(-0.51)).toBe("decreasing")
  })
})

describe("health issue prompt values", () => {
  it("keeps WAL counter values locale-independent for AI prompts", () => {
    const now = Date.now()
    const table = {
      walEnabled: true,
      table_suspended: false,
      table_memory_pressure_level: 0,
    } as Table
    const trendData: TrendData = {
      transactionLag: [
        { value: BigInt(1_000), timestamp: now - 1_000 },
        { value: BigInt(1_500), timestamp: now },
      ],
      walPendingRowCount: [
        { value: BigInt(2_000), timestamp: now - 1_000 },
        { value: BigInt(2_500), timestamp: now },
      ],
      ingestionMetric: [],
    }

    const status = calculateHealthStatus(table, { kind: "table" }, trendData)

    expect(status.issues.find((issue) => issue.id === "Y1")?.promptValue).toBe(
      "1500 txns",
    )
    expect(status.issues.find((issue) => issue.id === "Y2")?.promptValue).toBe(
      "2500 rows",
    )
  })
})

describe("detectIngestionActive", () => {
  it("should return false when less than 2 samples", () => {
    expect(detectIngestionActive([])).toBe(false)
    expect(detectIngestionActive([{ value: BigInt(100), timestamp: 0 }])).toBe(
      false,
    )
  })

  it("should return true when any increase detected in last 5 samples", () => {
    expect(
      detectIngestionActive([
        { value: BigInt(100), timestamp: 0 },
        { value: BigInt(100), timestamp: 1000 },
        { value: BigInt(101), timestamp: 2000 },
      ]),
    ).toBe(true)

    expect(
      detectIngestionActive([
        { value: BigInt(100), timestamp: 0 },
        { value: BigInt(101), timestamp: 1000 },
        { value: BigInt(100), timestamp: 2000 },
      ]),
    ).toBe(true)
  })

  it("should return false when no increase in last 5 samples", () => {
    expect(
      detectIngestionActive([
        { value: BigInt(100), timestamp: 0 },
        { value: BigInt(100), timestamp: 1000 },
        { value: BigInt(100), timestamp: 2000 },
      ]),
    ).toBe(false)

    expect(
      detectIngestionActive([
        { value: BigInt(100), timestamp: 0 },
        { value: BigInt(99), timestamp: 1000 },
        { value: BigInt(98), timestamp: 2000 },
      ]),
    ).toBe(false)
  })

  it("should only use last 5 samples even if more are available", () => {
    // First 3 samples have increases, but last 5 don't
    const samples = [
      { value: BigInt(100), timestamp: 0 },
      { value: BigInt(101), timestamp: 1000 },
      { value: BigInt(102), timestamp: 2000 },
      { value: BigInt(100), timestamp: 3000 },
      { value: BigInt(100), timestamp: 4000 },
      { value: BigInt(100), timestamp: 5000 },
      { value: BigInt(100), timestamp: 6000 },
      { value: BigInt(100), timestamp: 7000 },
    ]
    // Last 5: [100, 100, 100, 100, 100] - no increase
    expect(detectIngestionActive(samples)).toBe(false)
  })

  it("should detect increase in last 5 samples of longer array", () => {
    const samples = [
      { value: BigInt(100), timestamp: 0 },
      { value: BigInt(100), timestamp: 1000 },
      { value: BigInt(100), timestamp: 2000 },
      { value: BigInt(100), timestamp: 3000 },
      { value: BigInt(100), timestamp: 4000 },
      { value: BigInt(100), timestamp: 5000 },
      { value: BigInt(100), timestamp: 6000 },
      { value: BigInt(101), timestamp: 7000 }, // increase in last 5
    ]
    expect(detectIngestionActive(samples)).toBe(true)
  })
})

describe("write amplification health threshold", () => {
  const emptyTrend: TrendData = {
    walPendingRowCount: [],
    transactionLag: [],
    ingestionMetric: [],
  }
  const objectKinds: Array<{ name: string; kindData: TableKindData }> = [
    { name: "table", kindData: { kind: "table" } },
    {
      name: "materialized view",
      kindData: { kind: "matview", matView: loading },
    },
    { name: "live view", kindData: { kind: "liveview", liveView: loading } },
  ]

  for (const { name, kindData } of objectKinds) {
    it(`should warn for a ${name} starting at 3x`, () => {
      const table = {
        walEnabled: true,
        table_suspended: false,
        table_memory_pressure_level: 0,
        table_write_amp_p50: 3,
      } as Table

      const status = calculateHealthStatus(table, kindData, emptyTrend)

      expect(status.issues.find((issue) => issue.id === "Y4")).toMatchObject({
        severity: "warning",
        currentValue: "3.00x",
      })
    })

    it(`should not warn for a ${name} below 3x`, () => {
      const table = {
        walEnabled: true,
        table_suspended: false,
        table_memory_pressure_level: 0,
        table_write_amp_p50: 2.99,
      } as Table

      const status = calculateHealthStatus(table, kindData, emptyTrend)

      expect(status.issues.find((issue) => issue.id === "Y4")).toBeUndefined()
    })
  }
})

describe("calculateHealthStatus for live views", () => {
  const makeTable = (): Table =>
    ({
      table_name: "trades_ma",
      walEnabled: true,
      table_suspended: false,
      table_memory_pressure_level: 0,
    }) as Table

  const makeLiveView = (overrides: Partial<LiveView>): LiveView =>
    ({
      view_name: "trades_ma",
      view_status: "active",
      invalidation_reason: null,
      lag_seqtxn: BigInt(0),
      writer_stall_micros: BigInt(0),
      flush_every_interval: BigInt(30),
      flush_every_interval_unit: "SECOND",
      ...overrides,
    }) as LiveView

  const emptyTrend: TrendData = {
    walPendingRowCount: [],
    transactionLag: [],
    ingestionMetric: [],
  }

  it("should report no live view issues for a healthy active view", () => {
    // Given
    const liveView = makeLiveView({})

    // When
    const status = calculateHealthStatus(
      makeTable(),
      { kind: "liveview", liveView: ready(liveView) },
      emptyTrend,
    )

    // Then
    expect(status.overallSeverity).toBe("healthy")
    expect(status.issues).toEqual([])
  })

  it("should not raise an issue or a trend for a large live view lag", () => {
    // Given a live view far behind its base table
    const liveView = makeLiveView({ lag_seqtxn: BigInt(10_000) })

    // When its health is calculated
    const status = calculateHealthStatus(
      makeTable(),
      { kind: "liveview", liveView: ready(liveView) },
      emptyTrend,
    )

    // Then lag contributes nothing: it is a flush-cadence sawtooth, not a signal
    expect([...status.fieldIssues.keys()]).toEqual([])
    expect([...status.trendIndicators.keys()]).toEqual([])
    expect(status.issues).toEqual([])
  })

  it("should report a critical issue when the live view is invalid", () => {
    // Given
    const liveView = makeLiveView({
      view_status: "invalid",
      invalidation_reason: "base table column dropped",
    })

    // When
    const status = calculateHealthStatus(
      makeTable(),
      { kind: "liveview", liveView: ready(liveView) },
      emptyTrend,
    )

    // Then
    expect(status.overallSeverity).toBe("critical")
    expect(status.fieldIssues.get("viewStatus")).toMatchObject({
      id: "R5",
      severity: "critical",
      message: "Live view is invalid: base table column dropped",
    })
  })

  it("should omit the reason when the live view is invalid without one", () => {
    // Given
    const liveView = makeLiveView({
      view_status: "invalid",
      invalidation_reason: null,
    })

    // When
    const status = calculateHealthStatus(
      makeTable(),
      { kind: "liveview", liveView: ready(liveView) },
      emptyTrend,
    )

    // Then
    expect(status.fieldIssues.get("viewStatus")?.message).toBe(
      "Live view is invalid",
    )
  })

  it("should warn about a stalled writer regardless of flush interval", () => {
    // Given a fast flush interval and a stalled writer
    const liveView = makeLiveView({
      writer_stall_micros: BigInt(6_000_000),
      flush_every_interval: BigInt(1),
      flush_every_interval_unit: "SECOND",
    })

    // When
    const status = calculateHealthStatus(
      makeTable(),
      { kind: "liveview", liveView: ready(liveView) },
      emptyTrend,
    )

    // Then writer-stall detection remains independent of lag
    expect(status.fieldIssues.get("writerStall")).toMatchObject({ id: "Y7" })
  })

  it("should warn when the flush writer stalls beyond the threshold", () => {
    // Given
    const liveView = makeLiveView({ writer_stall_micros: BigInt(6_000_000) })

    // When
    const status = calculateHealthStatus(
      makeTable(),
      { kind: "liveview", liveView: ready(liveView) },
      emptyTrend,
    )

    // Then
    expect(status.fieldIssues.get("writerStall")).toMatchObject({
      id: "Y7",
      severity: "warning",
      currentValue: "6.0 s",
    })
  })

  it("should report a critical issue when the live view format version is unsupported", () => {
    // Given
    const liveView = makeLiveView({ view_status: "version_unsupported" })

    // When
    const status = calculateHealthStatus(
      makeTable(),
      { kind: "liveview", liveView: ready(liveView) },
      emptyTrend,
    )

    // Then
    expect(status.overallSeverity).toBe("critical")
    expect(status.fieldIssues.get("viewStatus")).toMatchObject({
      id: "R6",
      severity: "critical",
      message: "Live view format is not readable by this server build",
    })
  })

  it("should report a critical issue when the live view state is unreadable", () => {
    // Given
    const liveView = makeLiveView({ view_status: "state_unreadable" })

    // When
    const status = calculateHealthStatus(
      makeTable(),
      { kind: "liveview", liveView: ready(liveView) },
      emptyTrend,
    )

    // Then
    expect(status.overallSeverity).toBe("critical")
    expect(status.fieldIssues.get("viewStatus")).toMatchObject({
      id: "R7",
      severity: "critical",
      message: "Live view state files are unreadable",
    })
  })

  it("should report no live view issues while the metadata is still loading", () => {
    // Given a live view target whose metadata has not arrived yet

    // When
    const status = calculateHealthStatus(
      makeTable(),
      { kind: "liveview", liveView: loading },
      emptyTrend,
    )

    // Then
    expect(status.issues).toEqual([])
  })

  it("should report unknown when live view metadata is unavailable", () => {
    // Given
    const table = makeTable()

    // When
    const status = calculateHealthStatus(
      table,
      { kind: "liveview", liveView: { status: "unavailable" } },
      emptyTrend,
    )

    // Then
    expect(status.overallSeverity).toBe("unknown")
    expect(status.hasUnavailableSource).toBe(true)
    expect(status.issues).toEqual([])
  })

  it("should keep a known critical issue above unavailable metadata", () => {
    // Given
    const table = { ...makeTable(), table_suspended: true }

    // When
    const status = calculateHealthStatus(
      table,
      { kind: "liveview", liveView: { status: "unavailable" } },
      emptyTrend,
    )

    // Then
    expect(status.overallSeverity).toBe("critical")
    expect(status.fieldIssues.get("walStatus")?.id).toBe("R1")
  })

  it("should omit the reason when the matview is invalid without one", () => {
    // Given
    const matView = {
      view_name: "trades_ma",
      view_status: "invalid",
      invalidation_reason: null,
    } as MaterializedView

    // When
    const status = calculateHealthStatus(
      makeTable(),
      { kind: "matview", matView: ready(matView) },
      emptyTrend,
    )

    // Then
    expect(status.fieldIssues.get("viewStatus")?.message).toBe(
      "Materialized view is invalid",
    )
  })
})
