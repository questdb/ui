import { describe, expect, it } from "vitest"
import {
  bucketLanes,
  bucketSeverity,
  latestStateByLane,
  readStateSegments,
  severityOf,
  uptimeByLane,
} from "./stateSegments"
import type { StatementRows } from "./statementRows"

it("does not infer end times when an explicitly bound end column is missing", () => {
  const frame = {
    columns: [
      { name: "time", type: "TIMESTAMP" },
      { name: "lane", type: "SYMBOL" },
      { name: "state", type: "SYMBOL" },
    ],
    rows: [
      ["2026-01-01T00:00:00Z", "db", "up"],
      ["2026-01-01T00:01:00Z", "db", "down"],
    ],
  }
  expect(
    readStateSegments({ type: "uptime", columns: { end: "end_time" } }, frame),
  ).toContain('end: column "end_time" not found')
  expect(readStateSegments({ type: "stateTimeline" }, frame)).toMatchObject({
    lanes: ["db"],
  })
})

it("keeps the latest state per lane, preferring the last row on a tie", () => {
  // Given interleaved segments and two reports at the newest timestamp
  const segments = [
    { lane: "west", state: "down", start: 5, end: 7 },
    { lane: "east", state: "up", start: 2, end: 4 },
    { lane: "west", state: "up", start: 1, end: 5 },
    { lane: "west", state: "degraded", start: 5, end: 8 },
  ]

  // When computing current state, then older samples cannot replace newer ones
  expect(latestStateByLane(segments)).toEqual(
    new Map([
      ["west", "degraded"],
      ["east", "up"],
    ]),
  )
})

const HOUR = 3_600_000
const at = (h: number) => new Date(Date.UTC(2026, 0, 1, h)).toISOString()

it("counts overlapping intervals of the same state once in hover buckets", () => {
  const bucket = bucketLanes(
    {
      from: 0,
      to: 6,
      lanes: ["db"],
      states: ["down"],
      segments: [
        { lane: "db", state: "down", start: 0, end: 6 },
        { lane: "db", state: "down", start: 0, end: 6 },
      ],
    },
    1,
  ).get("db")?.[0]
  expect(bucket?.time.get("down")).toBe(6)
})

it("does not calculate uptime for a server-capped result", () => {
  const result: StatementRows = {
    columns: [
      { name: "ts", type: "TIMESTAMP" },
      { name: "lane", type: "SYMBOL" },
      { name: "state", type: "SYMBOL" },
    ],
    rows: [["2026-01-01T00:00:00Z", "primary", "up"]],
    partial: true,
  }
  expect(readStateSegments({ type: "uptime" }, result)).toContain(
    "requires a complete result",
  )
})

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
    expect(uptimeByLane(read.segments).get("db")).toBeCloseTo(0.75)
  })

  it("counts overlapping coverage once and treats any simultaneous bad state as down", () => {
    const uptime = uptimeByLane([
      { lane: "db", state: "offline", start: 40, end: 60 },
      { lane: "db", state: "up", start: 0, end: 60 },
      { lane: "db", state: "down", start: 30, end: 50 },
      { lane: "replica", state: "up", start: 30, end: 60 },
      { lane: "invalid", state: "up", start: 60, end: 30 },
    ])
    expect(uptime.get("db")).toBe(0.5)
    expect(uptime.get("replica")).toBe(1)
    expect(uptime.has("invalid")).toBe(false)
  })

  it("lets a severity override name what a state means", () => {
    // Given / When / Then
    expect(severityOf("picking")).toBe("neutral")
    expect(severityOf("picking", { picking: "good" })).toBe("good")
    expect(severityOf("Offline")).toBe("bad")
  })
})
