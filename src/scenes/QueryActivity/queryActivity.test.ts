import { describe, expect, it } from "vitest"
import { Type, type QueryRawResult } from "../../utils/questdb/types"
import {
  buildQueryActivityItems,
  classifyQuery,
  collectFinishedQueries,
  describeMemoryStatus,
  expireFinishedQueries,
  filterQueryActivityRows,
  getElapsedMs,
  NO_FINISHED_QUERIES,
  QUERY_ACTIVITY_SQL,
  summarizeQueryActivity,
  transformQueryActivityResponse,
  type QueryActivityRow,
  type QueryActivitySnapshot,
} from "./queryActivity"
import { QUERY_ACTIVITY_THRESHOLDS } from "./thresholds"

const SERVER_NOW = "2026-09-14T10:42:15.000000Z"
const MIB = BigInt(1024 * 1024)

const columns = [
  { name: "query_id", type: "LONG" },
  { name: "worker_id", type: "LONG" },
  { name: "worker_pool", type: "STRING" },
  { name: "username", type: "STRING" },
  { name: "query_start", type: "TIMESTAMP" },
  { name: "state_change", type: "TIMESTAMP" },
  { name: "state", type: "STRING" },
  { name: "is_wal", type: "BOOLEAN" },
  { name: "query", type: "STRING" },
  { name: "memory_used", type: "LONG" },
  { name: "memory_limit", type: "LONG" },
  { name: "server_now", type: "TIMESTAMP" },
]

const rawRow = (
  queryId: number,
  query: string,
  memoryUsed: string | null,
  memoryLimit: string | null,
) => [
  String(queryId),
  "3",
  "shared",
  "alice",
  "2026-09-14T10:41:03.000000Z",
  "2026-09-14T10:41:03.000000Z",
  "active",
  false,
  query,
  memoryUsed,
  memoryLimit,
  SERVER_NOW,
]

const response = (dataset: unknown[][]): QueryRawResult =>
  ({
    type: Type.DQL,
    query: QUERY_ACTIVITY_SQL,
    columns,
    dataset,
    count: dataset.length,
    timestamp: -1,
  }) as unknown as QueryRawResult

const row = (overrides: Partial<QueryActivityRow> = {}): QueryActivityRow => ({
  queryId: BigInt(1),
  workerId: BigInt(3),
  workerPool: "shared",
  username: "alice",
  queryStart: "2026-09-14T10:41:03.000000Z",
  stateChange: "2026-09-14T10:41:03.000000Z",
  state: "active",
  isWal: false,
  query: "SELECT 1",
  memoryUsed: null,
  memoryLimit: null,
  ...overrides,
})

const snapshot = (rows: QueryActivityRow[]): QueryActivitySnapshot => ({
  rows,
  serverNowMs: Date.parse(SERVER_NOW),
  receivedAtMs: 1_000,
})

describe("transformQueryActivityResponse", () => {
  it("drops the drawer's own listing query and converts longs to bigint", () => {
    // Given
    const raw = response([
      rawRow(62179, QUERY_ACTIVITY_SQL, "262144", "536870912"),
      rawRow(57777, "SELECT count() FROM trades", "8388608", null),
    ])

    // When
    const result = transformQueryActivityResponse(raw, 5_000)

    // Then
    expect(result?.rows).toHaveLength(1)
    expect(result?.rows[0]).toMatchObject({
      queryId: BigInt(57777),
      memoryUsed: BigInt(8388608),
      memoryLimit: null,
      state: "active",
    })
    expect(result?.serverNowMs).toBe(Date.parse(SERVER_NOW))
    expect(result?.receivedAtMs).toBe(5_000)
  })

  it("keeps null memory columns for background workloads", () => {
    // Given
    const raw = response([
      rawRow(1, "ALTER TABLE trades ADD COLUMN x INT", null, null),
    ])

    // When
    const result = transformQueryActivityResponse(raw, 0)

    // Then
    expect(result?.rows[0].memoryUsed).toBeNull()
    expect(result?.rows[0].memoryLimit).toBeNull()
  })

  it("returns undefined for a non-query response", () => {
    // Given
    const raw = { type: Type.ERROR, error: "boom" } as unknown as QueryRawResult

    // When / Then
    expect(transformQueryActivityResponse(raw, 0)).toBeUndefined()
  })
})

describe("getElapsedMs", () => {
  it("uses the server clock and advances with the client clock since the snapshot", () => {
    // Given a query that started 72 s before the server snapshot
    const current = snapshot([row()])

    // When 3 s of client time passed since the snapshot arrived
    const elapsed = getElapsedMs(row(), current, 4_000)

    // Then
    expect(elapsed).toBe(75_000)
  })
})

describe("classifyQuery", () => {
  it("grades memory as a share of the limit when a limit exists", () => {
    // Given a 1 GiB limit
    const limit = BigInt(1024) * MIB

    // Then
    expect(
      classifyQuery(
        row({ memoryUsed: BigInt(511) * MIB, memoryLimit: limit }),
        QUERY_ACTIVITY_THRESHOLDS,
      ),
    ).toBe("none")
    expect(
      classifyQuery(
        row({ memoryUsed: BigInt(512) * MIB, memoryLimit: limit }),
        QUERY_ACTIVITY_THRESHOLDS,
      ),
    ).toBe("warning")
    expect(
      classifyQuery(
        row({ memoryUsed: BigInt(820) * MIB, memoryLimit: limit }),
        QUERY_ACTIVITY_THRESHOLDS,
      ),
    ).toBe("critical")
  })

  it("never grades a query without a memory limit", () => {
    expect(
      classifyQuery(
        row({ memoryUsed: BigInt(4096) * MIB }),
        QUERY_ACTIVITY_THRESHOLDS,
      ),
    ).toBe("none")
  })

  it("never grades a cancelled query", () => {
    // Given a long, memory heavy query that is already cancelled
    const cancelled = row({
      state: "cancelled",
      memoryUsed: BigInt(4096) * MIB,
    })

    // When / Then
    expect(classifyQuery(cancelled, QUERY_ACTIVITY_THRESHOLDS)).toBe("none")
  })
})

describe("filterQueryActivityRows", () => {
  const rows = [
    row({
      queryId: BigInt(62179),
      username: "alice",
      query: "SELECT * FROM trades",
    }),
    row({
      queryId: BigInt(57777),
      username: "Bob",
      query: "INSERT INTO staging",
    }),
    row({ queryId: BigInt(58001), username: null, query: "ALTER TABLE trips" }),
  ]
  const idsFor = (filter: string) =>
    filterQueryActivityRows(rows, filter).map((r) => Number(r.queryId))

  it("returns every row for a blank filter", () => {
    expect(idsFor("  ")).toEqual([62179, 57777, 58001])
  })

  it("matches query text case-insensitively", () => {
    expect(idsFor("trades")).toEqual([62179])
    expect(idsFor("insert")).toEqual([57777])
  })

  it("matches the username", () => {
    expect(idsFor("bob")).toEqual([57777])
  })

  it("matches the query id", () => {
    expect(idsFor("580")).toEqual([58001])
  })
})

describe("describeMemoryStatus", () => {
  const describe_ = (overrides: Partial<QueryActivityRow>) => {
    const current = row(overrides)
    return describeMemoryStatus(
      current,
      classifyQuery(current, QUERY_ACTIVITY_THRESHOLDS),
      QUERY_ACTIVITY_THRESHOLDS,
    )
  }

  it("says nothing for a healthy query", () => {
    expect(describe_({ memoryUsed: BigInt(1) * MIB })).toBeNull()
  })

  it("names the share of the limit in use", () => {
    const limit = BigInt(1024) * MIB
    expect(
      describe_({ memoryUsed: BigInt(600) * MIB, memoryLimit: limit }),
    ).toBe("More than 50% of the available memory used")
    expect(
      describe_({ memoryUsed: BigInt(900) * MIB, memoryLimit: limit }),
    ).toBe("More than 80% of the available memory used")
  })

  it("says nothing for an unlimited query however much it uses", () => {
    expect(describe_({ memoryUsed: BigInt(4096) * MIB })).toBeNull()
  })

  it("says nothing for a cancelled query", () => {
    expect(
      describe_({ state: "cancelled", memoryUsed: BigInt(3000) * MIB }),
    ).toBeNull()
  })
})

describe("buildQueryActivityItems", () => {
  const older = row({
    queryId: BigInt(1),
    queryStart: "2026-09-14T10:40:00.000000Z",
    memoryUsed: BigInt(10),
  })
  const newer = row({
    queryId: BigInt(2),
    queryStart: "2026-09-14T10:42:00.000000Z",
    memoryUsed: BigInt(300),
  })
  const untracked = row({
    queryId: BigInt(3),
    queryStart: "2026-09-14T10:41:00.000000Z",
  })
  const current = snapshot([newer, untracked, older])
  const idsFor = (
    sort: "duration" | "memory" | "started" | "id",
    direction: "desc" | "asc",
  ) =>
    buildQueryActivityItems(
      current,
      NO_FINISHED_QUERIES,
      current.receivedAtMs,
      { sort, direction },
      QUERY_ACTIVITY_THRESHOLDS,
    ).map((item) => Number(item.row.queryId))

  it("puts the longest running query first when duration is descending", () => {
    expect(idsFor("duration", "desc")).toEqual([1, 3, 2])
  })

  it("puts the shortest running query first when duration is ascending", () => {
    expect(idsFor("duration", "asc")).toEqual([2, 3, 1])
  })

  it("keeps untracked memory last in both directions", () => {
    expect(idsFor("memory", "desc")).toEqual([2, 1, 3])
    expect(idsFor("memory", "asc")).toEqual([1, 2, 3])
  })

  it("orders by start time in both directions", () => {
    expect(idsFor("started", "desc")).toEqual([2, 3, 1])
    expect(idsFor("started", "asc")).toEqual([1, 3, 2])
  })

  it("orders by query id as a number in both directions", () => {
    expect(idsFor("id", "desc")).toEqual([3, 2, 1])
    expect(idsFor("id", "asc")).toEqual([1, 2, 3])
  })
})

describe("summarizeQueryActivity", () => {
  it("counts active queries and sums only the tracked memory", () => {
    // Given
    const rows = [
      row({ memoryUsed: BigInt(100) }),
      row({ state: "cancelled", memoryUsed: BigInt(50) }),
      row({ memoryUsed: null }),
    ]

    // When / Then
    expect(summarizeQueryActivity(rows)).toEqual({
      activeCount: 2,
      totalMemoryUsed: BigInt(150),
    })
  })

  it("reports no memory total when nothing is tracked", () => {
    expect(summarizeQueryActivity([row()]).totalMemoryUsed).toBeNull()
  })
})

describe("finished query retention", () => {
  const running = row({ queryId: BigInt(1) })
  const gone = row({
    queryId: BigInt(2),
    queryStart: "2026-09-14T10:42:00.000000Z",
  })
  const before = snapshot([running, gone])
  const after: QueryActivitySnapshot = {
    rows: [running],
    serverNowMs: before.serverNowMs + 2_000,
    receivedAtMs: before.receivedAtMs + 2_000,
  }
  const none = new Set<string>()

  it("keeps a vanished query with its duration frozen at the poll that lost it", () => {
    // When
    const finished = collectFinishedQueries(
      new Map(),
      before,
      after,
      none,
      10_000,
    )

    // Then
    expect([...finished.keys()]).toEqual(["2"])
    expect(finished.get("2")?.elapsedMs).toBe(17_000)
    expect(finished.get("2")?.releasedAtMs).toBe(10_000)
  })

  it("leaves the release clock unset while the query is held", () => {
    const finished = collectFinishedQueries(
      new Map(),
      before,
      after,
      new Set(["2"]),
      10_000,
    )
    expect(finished.get("2")?.releasedAtMs).toBeNull()
  })

  it("returns the same map when nothing vanished", () => {
    const finished = collectFinishedQueries(
      new Map(),
      after,
      after,
      none,
      10_000,
    )
    expect(finished.size).toBe(0)
  })

  it("wipes a released query after the grace period", () => {
    // Given
    const finished = collectFinishedQueries(
      new Map(),
      before,
      after,
      none,
      10_000,
    )

    // When / Then
    expect(expireFinishedQueries(finished, none, 14_999, 5_000).size).toBe(1)
    expect(expireFinishedQueries(finished, none, 15_000, 5_000).size).toBe(0)
  })

  it("restarts the grace period from the moment the hold ends", () => {
    // Given a query held past its original deadline
    const finished = collectFinishedQueries(
      new Map(),
      before,
      after,
      none,
      10_000,
    )
    const held = expireFinishedQueries(finished, new Set(["2"]), 20_000, 5_000)
    expect(held.get("2")?.releasedAtMs).toBeNull()

    // When the hold ends
    const released = expireFinishedQueries(held, none, 21_000, 5_000)

    // Then a fresh grace period starts
    expect(released.get("2")?.releasedAtMs).toBe(21_000)
    expect(expireFinishedQueries(released, none, 25_999, 5_000).size).toBe(1)
    expect(expireFinishedQueries(released, none, 26_000, 5_000).size).toBe(0)
  })
})
