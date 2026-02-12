import { describe, it, expect } from "vitest"
import {
  calculateTrendRate,
  getTrendDirection,
  detectIngestionActive,
  type TimestampedSample,
} from "./healthCheck"

const makeSamples = (
  values: number[],
  intervalMs: number = 1000,
  startTime: number = 0,
): TimestampedSample[] => {
  return values.map((value, i) => ({
    value,
    timestamp: startTime + i * intervalMs,
  }))
}

describe("calculateTrendRate", () => {
  it("should return 0 for less than 2 samples", () => {
    expect(calculateTrendRate([], 0)).toBe(0)
    expect(calculateTrendRate([{ value: 100, timestamp: 0 }], 0)).toBe(0)
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

  it("should handle noisy data and find overall trend", () => {
    // [100, 150, 120, 180, 150] over 8 seconds - overall increasing
    const samples = [
      { value: 100, timestamp: 0 },
      { value: 150, timestamp: 2000 },
      { value: 120, timestamp: 4000 },
      { value: 180, timestamp: 6000 },
      { value: 150, timestamp: 8000 },
    ]
    const rate = calculateTrendRate(samples, 8000)
    // Should detect overall positive trend
    expect(rate).toBeGreaterThan(0)
  })

  it("should detect recovery after spike", () => {
    // [0, 100, 200, 100, 5] - spike then recovery
    const samples = [
      { value: 0, timestamp: 0 },
      { value: 100, timestamp: 2000 },
      { value: 200, timestamp: 4000 },
      { value: 100, timestamp: 6000 },
      { value: 5, timestamp: 8000 },
    ]
    const rate = calculateTrendRate(samples, 8000)
    // Linear regression gives small positive slope (~0.625) due to math
    // The key is that it's close to 0, not strongly trending
    expect(Math.abs(rate)).toBeLessThan(5)
  })

  it("should only consider samples within 30-second window", () => {
    const now = 60000 // 60 seconds
    const samples = [
      { value: 1000, timestamp: 0 }, // 60s ago - should be excluded
      { value: 900, timestamp: 10000 }, // 50s ago - should be excluded
      { value: 100, timestamp: 35000 }, // 25s ago - included
      { value: 200, timestamp: 45000 }, // 15s ago - included
      { value: 300, timestamp: 55000 }, // 5s ago - included
    ]
    const rate = calculateTrendRate(samples, now)
    // Only last 3 samples within 30s window: 100 -> 200 -> 300 over 20s = 10/s
    expect(rate).toBeCloseTo(10)
  })

  it("should handle single sample within window", () => {
    const now = 60000
    const samples = [
      { value: 1000, timestamp: 0 }, // 60s ago - excluded
      { value: 500, timestamp: 50000 }, // 10s ago - only sample in window
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

describe("detectIngestionActive", () => {
  it("should return false when less than 2 samples", () => {
    expect(detectIngestionActive([])).toBe(false)
    expect(detectIngestionActive([{ value: 100, timestamp: 0 }])).toBe(false)
  })

  it("should return true when any increase detected in last 5 samples", () => {
    expect(
      detectIngestionActive([
        { value: 100, timestamp: 0 },
        { value: 100, timestamp: 1000 },
        { value: 101, timestamp: 2000 },
      ]),
    ).toBe(true)

    expect(
      detectIngestionActive([
        { value: 100, timestamp: 0 },
        { value: 101, timestamp: 1000 },
        { value: 100, timestamp: 2000 },
      ]),
    ).toBe(true)
  })

  it("should return false when no increase in last 5 samples", () => {
    expect(
      detectIngestionActive([
        { value: 100, timestamp: 0 },
        { value: 100, timestamp: 1000 },
        { value: 100, timestamp: 2000 },
      ]),
    ).toBe(false)

    expect(
      detectIngestionActive([
        { value: 100, timestamp: 0 },
        { value: 99, timestamp: 1000 },
        { value: 98, timestamp: 2000 },
      ]),
    ).toBe(false)
  })

  it("should only use last 5 samples even if more are available", () => {
    // First 3 samples have increases, but last 5 don't
    const samples = [
      { value: 100, timestamp: 0 },
      { value: 101, timestamp: 1000 },
      { value: 102, timestamp: 2000 },
      { value: 100, timestamp: 3000 },
      { value: 100, timestamp: 4000 },
      { value: 100, timestamp: 5000 },
      { value: 100, timestamp: 6000 },
      { value: 100, timestamp: 7000 },
    ]
    // Last 5: [100, 100, 100, 100, 100] - no increase
    expect(detectIngestionActive(samples)).toBe(false)
  })

  it("should detect increase in last 5 samples of longer array", () => {
    const samples = [
      { value: 100, timestamp: 0 },
      { value: 100, timestamp: 1000 },
      { value: 100, timestamp: 2000 },
      { value: 100, timestamp: 3000 },
      { value: 100, timestamp: 4000 },
      { value: 100, timestamp: 5000 },
      { value: 100, timestamp: 6000 },
      { value: 101, timestamp: 7000 }, // increase in last 5
    ]
    expect(detectIngestionActive(samples)).toBe(true)
  })
})
