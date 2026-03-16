import { describe, it, expect, beforeEach } from "vitest"
import { applyDebounceFilter, updateFirstSeen } from "./useDebouncedWarnings"
import type { HealthStatus, HealthIssue, TrendIndicator } from "./healthCheck"

const makeHealthStatus = (
  issueIds: string[],
  options?: { trendDirection?: "increasing" | "decreasing" },
): HealthStatus => {
  const issues: HealthIssue[] = issueIds.map((id) => ({
    id,
    severity: "warning" as const,
    field: id === "Y1" ? "transactionLag" : id === "Y2" ? "pendingRows" : id,
    message: `Issue ${id}`,
  }))

  const trendIndicators = new Map<string, TrendIndicator>()
  for (const id of issueIds) {
    const trendKey =
      id === "Y1" ? "transactionLag" : id === "Y2" ? "pendingRows" : null
    if (trendKey) {
      trendIndicators.set(trendKey, {
        field: trendKey,
        direction: options?.trendDirection ?? "increasing",
        rate: 2.5,
        message: "test",
      })
    }
  }

  const fieldIssues = new Map<string, HealthIssue>()
  for (const issue of issues) {
    fieldIssues.set(issue.field, issue)
  }

  return {
    overallSeverity: issues.length > 0 ? "warning" : "healthy",
    issues,
    fieldIssues,
    trendIndicators,
  }
}

/**
 * Simulates the debounce state machine using the same pure functions
 * as the hook, just with an explicit firstSeen map instead of useRef.
 */
class DebounceSimulator {
  firstSeen = new Map<string, number>()

  process(
    rawHealthStatus: HealthStatus | null,
    now: number,
  ): HealthStatus | null {
    if (!rawHealthStatus) {
      this.firstSeen.clear()
      return null
    }

    const confirmedIds = updateFirstSeen(this.firstSeen, rawHealthStatus, now)
    return applyDebounceFilter(rawHealthStatus, confirmedIds)
  }
}

describe("useDebouncedWarnings", () => {
  let sim: DebounceSimulator

  beforeEach(() => {
    sim = new DebounceSimulator()
  })

  it("should return null when rawHealthStatus is null", () => {
    expect(sim.process(null, 0)).toBeNull()
  })

  it("should filter Y1 immediately (not yet confirmed)", () => {
    const raw = makeHealthStatus(["Y1"])
    const result = sim.process(raw, 0)!

    expect(result.issues).toHaveLength(0)
    expect(result.trendIndicators.has("transactionLag")).toBe(false)
  })

  it("should confirm Y1 after 5 seconds of continuous presence", () => {
    const raw = makeHealthStatus(["Y1"])

    let result = sim.process(raw, 0)!
    expect(result.issues).toHaveLength(0)

    result = sim.process(raw, 2000)!
    expect(result.issues).toHaveLength(0)

    result = sim.process(raw, 4000)!
    expect(result.issues).toHaveLength(0)

    result = sim.process(raw, 5000)!
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0].id).toBe("Y1")
    expect(result.trendIndicators.has("transactionLag")).toBe(true)
  })

  it("should clear instantly when issue disappears before 5 seconds", () => {
    const withY1 = makeHealthStatus(["Y1"])
    const withoutY1 = makeHealthStatus([])

    sim.process(withY1, 0)

    let result = sim.process(withY1, 3000)!
    expect(result.issues).toHaveLength(0)

    result = sim.process(withoutY1, 3500)!
    expect(result.issues).toHaveLength(0)

    result = sim.process(withoutY1, 8000)!
    expect(result.issues).toHaveLength(0)
  })

  it("should clear confirmed issue instantly when it disappears", () => {
    const withY1 = makeHealthStatus(["Y1"])
    const withoutY1 = makeHealthStatus([])

    sim.process(withY1, 0)
    let result = sim.process(withY1, 5000)!
    expect(result.issues).toHaveLength(1)

    result = sim.process(withoutY1, 5500)!
    expect(result.issues).toHaveLength(0)
  })

  it("should not affect non-debounced warnings (Y3)", () => {
    const raw = makeHealthStatus(["Y3"])
    const result = sim.process(raw, 0)!

    expect(result.issues).toHaveLength(1)
    expect(result.issues[0].id).toBe("Y3")
  })

  it("should handle Y1 and Y2 independently", () => {
    const withBoth = makeHealthStatus(["Y1", "Y2"])
    const withY1Only = makeHealthStatus(["Y1"])

    let result = sim.process(withBoth, 0)!
    expect(result.issues).toHaveLength(0)

    result = sim.process(withY1Only, 3000)!
    expect(result.issues).toHaveLength(0)

    result = sim.process(withY1Only, 5000)!
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0].id).toBe("Y1")
  })

  it("should reset the clock when issue reappears after clearing", () => {
    const withY1 = makeHealthStatus(["Y1"])
    const withoutY1 = makeHealthStatus([])

    sim.process(withY1, 0)
    sim.process(withoutY1, 3000)

    let result = sim.process(withY1, 4000)!
    expect(result.issues).toHaveLength(0)

    result = sim.process(withY1, 8000)!
    expect(result.issues).toHaveLength(0)

    result = sim.process(withY1, 9000)!
    expect(result.issues).toHaveLength(1)
  })

  it("should reset all state when rawHealthStatus becomes null", () => {
    const withY1 = makeHealthStatus(["Y1"])

    sim.process(withY1, 0)
    let result = sim.process(withY1, 5000)!
    expect(result.issues).toHaveLength(1)

    sim.process(null, 5500)
    expect(sim.firstSeen.size).toBe(0)

    result = sim.process(withY1, 6000)!
    expect(result.issues).toHaveLength(0)

    result = sim.process(withY1, 11000)!
    expect(result.issues).toHaveLength(1)
  })

  it("should keep decreasing trends even when Y1/Y2 are unconfirmed", () => {
    const raw = makeHealthStatus(["Y1"], { trendDirection: "decreasing" })
    const result = sim.process(raw, 0)!

    expect(result.issues).toHaveLength(0)
    expect(result.trendIndicators.has("transactionLag")).toBe(true)
    expect(result.trendIndicators.get("transactionLag")?.direction).toBe(
      "decreasing",
    )
  })

  it("should handle mixed debounced and non-debounced warnings", () => {
    const issues: HealthIssue[] = [
      {
        id: "Y1",
        severity: "warning",
        field: "transactionLag",
        message: "Transaction lag increasing",
      },
      {
        id: "Y3",
        severity: "warning",
        field: "txSizeP90",
        message: "Small transactions",
      },
    ]
    const fieldIssues = new Map<string, HealthIssue>()
    for (const i of issues) fieldIssues.set(i.field, i)
    const raw: HealthStatus = {
      overallSeverity: "warning",
      issues,
      fieldIssues,
      trendIndicators: new Map(),
    }

    const result = sim.process(raw, 0)!

    expect(result.issues).toHaveLength(1)
    expect(result.issues[0].id).toBe("Y3")
    expect(result.overallSeverity).toBe("warning")
  })
})
