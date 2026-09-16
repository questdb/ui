import * as QuestDB from "../../utils/questdb"
import type { QueryActivityThresholds } from "./thresholds"

export const QUERY_ACTIVITY_SQL =
  "SELECT query_id, worker_id, worker_pool, username, query_start, state_change, state, is_wal, query, memory_used, memory_limit, now() AS server_now FROM query_activity();"

export type QueryActivityState = "active" | "cancelled"

export type QueryActivityRow = {
  queryId: bigint
  workerId: bigint
  workerPool: string | null
  username: string | null
  queryStart: string
  stateChange: string
  state: QueryActivityState
  isWal: boolean
  query: string
  memoryUsed: bigint | null
  memoryLimit: bigint | null
}

export type QueryActivitySnapshot = {
  rows: QueryActivityRow[]
  serverNowMs: number
  receivedAtMs: number
}

export type Severity = "none" | "warning" | "critical"

export type QueryPhase = "running" | "cancelled" | "finished"

export type QueryActivityItem = {
  row: QueryActivityRow
  phase: QueryPhase
  elapsedMs: number
  severity: Severity
  fading: boolean
}

export type FinishedQuery = {
  row: QueryActivityRow
  elapsedMs: number
  releasedAtMs: number | null
}

export type FinishedQueries = ReadonlyMap<string, FinishedQuery>

export const NO_FINISHED_QUERIES: FinishedQueries = new Map()

export const FINISHED_GRACE_MS = 5_000
export const FINISHED_FADE_MS = 300
// The fade flag flips on the clock tick before the wipe. The transition is
// delayed so it ends just before that tick removes the row.
export const FINISHED_FADE_LEAD_MS = 1_000
export const FINISHED_FADE_DELAY_MS =
  FINISHED_FADE_LEAD_MS - FINISHED_FADE_MS - 100

const isFading = (entry: FinishedQuery | undefined, nowMs: number) =>
  entry?.releasedAtMs != null &&
  nowMs - entry.releasedAtMs >= FINISHED_GRACE_MS - FINISHED_FADE_LEAD_MS

export type QueryActivitySort = "duration" | "memory" | "started" | "id"

export type QueryActivitySortDirection = "desc" | "asc"

export type QueryActivityOrder = {
  sort: QueryActivitySort
  direction: QueryActivitySortDirection
}

export type QueryActivityOrderKey =
  `${QueryActivitySort}:${QueryActivitySortDirection}`

const SORT_LABELS: Record<QueryActivitySort, string> = {
  duration: "Duration",
  memory: "Memory used",
  started: "Start time",
  id: "Query ID",
}

const DIRECTION_LABELS: Record<QueryActivitySortDirection, string> = {
  desc: "Desc",
  asc: "Asc",
}

export const toOrderKey = ({
  sort,
  direction,
}: QueryActivityOrder): QueryActivityOrderKey => `${sort}:${direction}`

const ORDER_LABELS: Record<QueryActivityOrderKey, string> = {
  "duration:desc": "Longest first",
  "duration:asc": "Shortest first",
  "memory:desc": "Most memory",
  "memory:asc": "Least memory",
  "started:desc": "Newest first",
  "started:asc": "Oldest first",
  "id:desc": "Highest ID",
  "id:asc": "Lowest ID",
}

export const formatOrder = (order: QueryActivityOrder): string =>
  ORDER_LABELS[toOrderKey(order)]

export const QUERY_ACTIVITY_ORDER_OPTIONS: {
  key: QueryActivityOrderKey
  order: QueryActivityOrder
  label: string
}[] = (Object.keys(SORT_LABELS) as QueryActivitySort[]).flatMap((sort) =>
  (Object.keys(DIRECTION_LABELS) as QueryActivitySortDirection[]).map(
    (direction) => ({
      key: toOrderKey({ sort, direction }),
      order: { sort, direction },
      label: formatOrder({ sort, direction }),
    }),
  ),
)

export type QueryActivitySummary = {
  activeCount: number
  totalMemoryUsed: bigint | null
}

type RawQueryActivityRow = {
  query_id: bigint
  worker_id: bigint
  worker_pool: string | null
  username: string | null
  query_start: string
  state_change: string
  state: string
  is_wal: boolean
  query: string
  memory_used: bigint | null
  memory_limit: bigint | null
  server_now: string
}

const normalizeSql = (sql: string) => sql.trim().replace(/;+\s*$/, "")

const isSelfQuery = (query: string) =>
  normalizeSql(query) === normalizeSql(QUERY_ACTIVITY_SQL)

const toRow = (raw: RawQueryActivityRow): QueryActivityRow => ({
  queryId: raw.query_id,
  workerId: raw.worker_id,
  workerPool: raw.worker_pool,
  username: raw.username,
  queryStart: raw.query_start,
  stateChange: raw.state_change,
  state: raw.state === "cancelled" ? "cancelled" : "active",
  isWal: raw.is_wal,
  query: raw.query,
  memoryUsed: raw.memory_used,
  memoryLimit: raw.memory_limit,
})

export const transformQueryActivityResponse = (
  response: QuestDB.QueryRawResult,
  receivedAtMs: number,
): QueryActivitySnapshot | undefined => {
  const result = QuestDB.Client.transformQueryRawResult<RawQueryActivityRow>(
    response,
    { convertLongsToBigInt: true },
  )
  if (result.type !== QuestDB.Type.DQL) return undefined

  const serverNow = result.data[0]?.server_now
  const serverNowMs = serverNow ? Date.parse(serverNow) : receivedAtMs
  const rows = result.data.filter((raw) => !isSelfQuery(raw.query)).map(toRow)

  return { rows, serverNowMs, receivedAtMs }
}

export const getElapsedMs = (
  row: QueryActivityRow,
  snapshot: QueryActivitySnapshot,
  clientNowMs: number,
): number => {
  const elapsedAtSnapshot = snapshot.serverNowMs - Date.parse(row.queryStart)
  const sinceSnapshot = clientNowMs - snapshot.receivedAtMs
  return Math.max(0, elapsedAtSnapshot + sinceSnapshot)
}

const classifyMemory = (
  row: QueryActivityRow,
  thresholds: QueryActivityThresholds,
): Severity => {
  if (
    row.memoryUsed === null ||
    row.memoryLimit === null ||
    row.memoryLimit <= BigInt(0)
  ) {
    return "none"
  }

  const ratio = Number(row.memoryUsed) / Number(row.memoryLimit)
  if (ratio >= thresholds.memoryLimitCriticalRatio) return "critical"
  if (ratio >= thresholds.memoryLimitWarningRatio) return "warning"
  return "none"
}

export const classifyQuery = (
  row: QueryActivityRow,
  thresholds: QueryActivityThresholds,
): Severity =>
  row.state === "cancelled" ? "none" : classifyMemory(row, thresholds)

const queryKey = (row: QueryActivityRow) => row.queryId.toString()

export const collectFinishedQueries = (
  finished: FinishedQueries,
  previousSnapshot: QueryActivitySnapshot,
  snapshot: QueryActivitySnapshot,
  heldIds: ReadonlySet<string>,
  nowMs: number,
): FinishedQueries => {
  const currentIds = new Set(snapshot.rows.map(queryKey))
  const next = new Map<string, FinishedQuery>()
  for (const [id, entry] of finished) {
    if (!currentIds.has(id)) next.set(id, entry)
  }
  for (const row of previousSnapshot.rows) {
    const id = queryKey(row)
    if (currentIds.has(id) || next.has(id)) continue
    next.set(id, {
      row,
      elapsedMs: getElapsedMs(row, previousSnapshot, snapshot.receivedAtMs),
      releasedAtMs: heldIds.has(id) ? null : nowMs,
    })
  }
  const unchanged =
    next.size === finished.size &&
    [...next.keys()].every((id) => finished.has(id))
  return unchanged ? finished : next
}

export const expireFinishedQueries = (
  finished: FinishedQueries,
  heldIds: ReadonlySet<string>,
  nowMs: number,
  graceMs: number,
): FinishedQueries => {
  let changed = false
  const next = new Map<string, FinishedQuery>()
  for (const [id, entry] of finished) {
    if (heldIds.has(id)) {
      changed ||= entry.releasedAtMs !== null
      next.set(
        id,
        entry.releasedAtMs === null ? entry : { ...entry, releasedAtMs: null },
      )
    } else if (entry.releasedAtMs === null) {
      changed = true
      next.set(id, { ...entry, releasedAtMs: nowMs })
    } else if (nowMs - entry.releasedAtMs >= graceMs) {
      changed = true
    } else {
      next.set(id, entry)
    }
  }
  return changed ? next : finished
}

export const filterQueryActivityRows = (
  rows: QueryActivityRow[],
  filter: string,
): QueryActivityRow[] => {
  const needle = filter.trim().toLowerCase()
  if (needle === "") return rows
  return rows.filter(
    (row) =>
      row.query.toLowerCase().includes(needle) ||
      (row.username?.toLowerCase().includes(needle) ?? false) ||
      row.queryId.toString().includes(needle),
  )
}

export const describeMemoryStatus = (
  row: QueryActivityRow,
  severity: Severity,
  thresholds: QueryActivityThresholds,
): string | null => {
  if (severity === "none") return null
  const ratio =
    severity === "critical"
      ? thresholds.memoryLimitCriticalRatio
      : thresholds.memoryLimitWarningRatio
  return `More than ${Math.round(ratio * 100)}% of the available memory used`
}

const compareBigInt = (a: bigint, b: bigint) => (a < b ? -1 : a > b ? 1 : 0)

const SORT_KEYS: Record<
  QueryActivitySort,
  (item: QueryActivityItem) => number | null
> = {
  duration: (item) => item.elapsedMs,
  memory: (item) =>
    item.row.memoryUsed === null ? null : Number(item.row.memoryUsed),
  started: (item) => Date.parse(item.row.queryStart),
  id: (item) => Number(item.row.queryId),
}

const compareItems = (
  a: QueryActivityItem,
  b: QueryActivityItem,
  { sort, direction }: QueryActivityOrder,
): number => {
  const keyOf = SORT_KEYS[sort]
  const keyA = keyOf(a)
  const keyB = keyOf(b)
  if (keyA === null && keyB === null) return 0
  if (keyA === null) return 1
  if (keyB === null) return -1
  return direction === "desc" ? keyB - keyA : keyA - keyB
}

const phaseOf = (
  row: QueryActivityRow,
  finished: FinishedQuery | undefined,
): QueryPhase =>
  row.state === "cancelled" ? "cancelled" : finished ? "finished" : "running"

export const buildQueryActivityItems = (
  snapshot: QueryActivitySnapshot,
  finished: FinishedQueries,
  clientNowMs: number,
  order: QueryActivityOrder,
  thresholds: QueryActivityThresholds,
): QueryActivityItem[] =>
  snapshot.rows
    .map((row) => {
      const finishedEntry = finished.get(queryKey(row))
      const elapsedMs =
        finishedEntry?.elapsedMs ?? getElapsedMs(row, snapshot, clientNowMs)
      return {
        row,
        phase: phaseOf(row, finishedEntry),
        elapsedMs,
        severity: classifyQuery(row, thresholds),
        fading: isFading(finishedEntry, clientNowMs),
      }
    })
    .sort(
      (a, b) =>
        compareItems(a, b, order) ||
        compareBigInt(a.row.queryId, b.row.queryId),
    )

export const summarizeQueryActivity = (
  rows: QueryActivityRow[],
): QueryActivitySummary => {
  const tracked = rows.filter((row) => row.memoryUsed !== null)
  return {
    activeCount: rows.filter((row) => row.state === "active").length,
    totalMemoryUsed:
      tracked.length === 0
        ? null
        : tracked.reduce(
            (total, row) => total + (row.memoryUsed ?? BigInt(0)),
            BigInt(0),
          ),
  }
}
