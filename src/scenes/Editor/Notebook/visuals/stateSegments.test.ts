import { describe, expect, it } from "vitest"
import {
  bucketLanes,
  bucketSeverity,
  readStateSegments,
  severityOf,
  uptimeOf,
} from "./stateSegments"
import type { StatementRows } from "./statementRows"

const HOUR = 3_600_000
const at = (h: number) => new Date(Date.UTC(2026, 0, 1, h)).toISOString()

const states = (data: [number, string, string][]): StatementRows => ({
  columns: [
    { name: "ts", type: "TIMESTAMP" },
    { name: "lane", type: "SYMBOL" },
    { name: "state", type: "SYMBOL" },
  ],
  rows: data.map(([h, lane, state]) => [at(h), lane, state]),
})

describe("readStateSegments", () => {
  it("lasts each state until the lane's next row and sorts lanes naturally", () => {
    // Given
    const rows = states([
      [0, "R-10", "up"],
      [0, "R-2", "up"],
      [2, "R-2", "down"],
      [4, "R-2", "up"],
    ])

    // When
    const read = readStateSegments({ type: "uptime" }, rows)

    // Then
    if (typeof read === "string") throw new Error(read)
    expect(read.lanes).toEqual(["R-2", "R-10"])
    const down = read.segments.find((s) => s.state === "down")
    expect(down && (down.end - down.start) / HOUR).toBe(2)
  })

  it("names a missing column", () => {
    // Given / When
    const read = readStateSegments(
      { type: "uptime", columns: { lane: "robot" } },
      states([[0, "a", "up"]]),
    )

    // Then
    expect(read).toContain("lane")
  })
})

describe("uptime buckets", () => {
  it("colours a bucket by its worst state and counts uptime by time", () => {
    // Given 4 hours: up, down for one hour, up
    const read = readStateSegments(
      { type: "uptime" },
      states([
        [0, "db", "up"],
        [1, "db", "down"],
        [2, "db", "up"],
        [4, "db", "up"],
      ]),
    )
    if (typeof read === "string") throw new Error(read)

    // When split into 4 hourly buckets
    const buckets = bucketLanes(read, 4).get("db") ?? []

    // Then
    expect(buckets.map((b) => bucketSeverity(b))).toEqual([
      "good",
      "bad",
      "good",
      "good",
    ])
    expect(uptimeOf(buckets)).toBeCloseTo(0.75)
  })

  it("lets a severity override name what a state means", () => {
    // Given / When / Then
    expect(severityOf("picking")).toBe("neutral")
    expect(severityOf("picking", { picking: "good" })).toBe("good")
    expect(severityOf("Offline")).toBe("bad")
  })
})
