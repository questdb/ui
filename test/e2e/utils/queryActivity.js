const SERVER_NOW = "2026-09-14T10:42:15.000000Z"
const LISTING_QUERY =
  "SELECT query_id, worker_id, worker_pool, username, query_start, state_change, state, is_wal, query, memory_used, memory_limit, now() AS server_now FROM query_activity();"

const COLUMNS = [
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

const MIB = 1024 * 1024

const row = ({
  queryId,
  query,
  startedSecondsAgo,
  state = "active",
  isWal = false,
  memoryUsed = null,
  memoryLimit = null,
  username = "alice",
  workerPool = "shared",
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

const SELF_ROW = row({
  queryId: 1,
  query: LISTING_QUERY,
  startedSecondsAgo: 0,
  memoryUsed: 0,
})

const listingResponse = (dataset) => ({
  query: LISTING_QUERY,
  columns: COLUMNS,
  timestamp: -1,
  dataset,
  count: dataset.length,
})

const LARGE_LISTING_SIZE = 10000
const LARGE_LISTING_FIRST_ID = 100000
const LARGE_LISTING_USERS = ["alice", "bob", "carol"]
const LARGE_LISTING_NEEDLE_USER = "zed"
const LARGE_LISTING_NEEDLE_INDEX = 4321
const LARGE_LISTING_MAX_AGE_SECONDS = 600

const largeListing = () =>
  Array.from({ length: LARGE_LISTING_SIZE }, (_, index) =>
    row({
      queryId: LARGE_LISTING_FIRST_ID + index,
      query: `SELECT symbol, avg(price) FROM trades_${index} SAMPLE BY 1m`,
      startedSecondsAgo: index % LARGE_LISTING_MAX_AGE_SECONDS,
      memoryUsed: ((index * 7919) % 4096) * MIB,
      memoryLimit: 4096 * MIB,
      username:
        index === LARGE_LISTING_NEEDLE_INDEX
          ? LARGE_LISTING_NEEDLE_USER
          : LARGE_LISTING_USERS[index % LARGE_LISTING_USERS.length],
    }),
  )

module.exports = {
  SELF_ROW,
  listingResponse,
  largeListing,
  LARGE_LISTING_SIZE,
  LARGE_LISTING_FIRST_ID,
  LARGE_LISTING_NEEDLE_USER,
  LARGE_LISTING_NEEDLE_INDEX,
  LARGE_LISTING_MAX_AGE_SECONDS,
}
