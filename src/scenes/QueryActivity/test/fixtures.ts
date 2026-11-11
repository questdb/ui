export const SERVER_NOW = "2026-09-14T10:42:15.000000Z"
export const LISTING_QUERY =
  "SELECT query_id, worker_id, worker_pool, username, query_start, state_change, state, is_wal, query, memory_used, memory_limit, now() AS server_now FROM query_activity();"

export const COLUMNS = [
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

export const MIB = 1024 * 1024

export const row = ({
  queryId,
  query,
  startedSecondsAgo,
  state = "active",
  isWal = false,
  memoryUsed = null,
  memoryLimit = null,
  username = "alice",
  workerPool = "shared",
}: {
  queryId: number
  query: string
  startedSecondsAgo: number
  state?: string
  isWal?: boolean
  memoryUsed?: number | null
  memoryLimit?: number | null
  username?: string
  workerPool?: string
}) => {
  const start = new Date(
    Date.parse(SERVER_NOW) - startedSecondsAgo * 1000,
  ).toISOString()
  return [
    queryId,
    3,
    workerPool,
    username,
    start,
    state === "cancelled" ? SERVER_NOW : start,
    state,
    isWal,
    query,
    memoryUsed,
    memoryLimit,
    SERVER_NOW,
  ]
}

export const SELF_ROW = row({
  queryId: 1,
  query: LISTING_QUERY,
  startedSecondsAgo: 0,
  memoryUsed: 0,
})

export const CRITICAL_ROW = row({
  queryId: 62179,
  query: "SELECT symbol, approx_percentile(price, 0.5, 2) FROM trades",
  startedSecondsAgo: 72,
  memoryUsed: 812 * MIB,
  memoryLimit: 1024 * MIB,
})

export const WARNING_ROW = row({
  queryId: 57777,
  query: "INSERT INTO trades SELECT * FROM staging",
  startedSecondsAgo: 14,
  memoryUsed: 96 * MIB,
  username: "bob",
})

export const WAL_ROW = row({
  queryId: 58001,
  query: "ALTER TABLE trades ADD COLUMN venue SYMBOL",
  startedSecondsAgo: 3,
  isWal: true,
  username: "system",
  workerPool: "wal-apply",
})

export const CANCELLED_ROW = row({
  queryId: 58010,
  query: "SELECT count() FROM trades WHERE symbol = 'BTC-USD'",
  startedSecondsAgo: 42,
  state: "cancelled",
  memoryUsed: 1000 * MIB,
  memoryLimit: 1024 * MIB,
})

export const listingResponse = (dataset: ReturnType<typeof row>[]) => ({
  query: LISTING_QUERY,
  columns: COLUMNS,
  timestamp: -1,
  dataset,
  count: dataset.length,
})
