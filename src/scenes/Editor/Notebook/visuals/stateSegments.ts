import type { VisualConfig } from "../CellChart/chartTypes"
import {
  columnIndex,
  firstColumnOf,
  toLabel,
  toTime,
  type StatementRows,
} from "./statementRows"

// States over time, per lane, as the state timeline and the uptime bars read
// them: rows of (time, lane, state[, end]). Without an end column a state
// lasts until the lane's next row.

export type Severity = "good" | "neutral" | "warning" | "bad"

// A lane's state from start to end.
export type Span = {
  lane: string
  state: string
  start: number
  end: number
}

export type Segment = Span & {
  // The row the segment was read from.
  row: number
}

export type StateSegments = {
  lanes: string[]
  states: string[]
  segments: Segment[]
  // The lane column, and the rows each lane was read from.
  laneColumn: number
  laneRows: ReadonlyMap<string, number[]>
  from: number
  to: number
}

const GOOD_STATE =
  /^(ok|up|active|running|healthy|on|true|online|moving|operational)$/
const WARN_STATE =
  /^(warn|warning|degraded|paused|lagging|pending|charging|maintenance|partial)$/
const BAD_STATE =
  /^(error|down|failed|fault|suspended|critical|false|offline|outage)$/

export const SEVERITY_RANK: Record<Severity, number> = {
  good: 0,
  neutral: 1,
  warning: 2,
  bad: 3,
}

export const severityOf = (
  state: string,
  overrides?: Record<string, Severity>,
): Severity => {
  const set = overrides?.[state]
  if (set) return set
  const lower = state.toLowerCase()
  if (GOOD_STATE.test(lower)) return "good"
  if (WARN_STATE.test(lower)) return "warning"
  if (BAD_STATE.test(lower)) return "bad"
  return "neutral"
}

export const naturalOrder = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true })

export const readStateSegments = (
  visual: VisualConfig,
  rows: StatementRows | null,
): StateSegments | string => {
  if (!rows || rows.rows.length === 0) return "The query returned no rows."
  // A prefix of the rows would end each lane's last state at the cut and
  // drop the lanes after it.
  if (rows.partial)
    return `${visual.type === "uptime" ? "Uptime" : "A state timeline"} requires a complete result. Narrow the time window or aggregate the query.`
  const c = visual.columns ?? {}
  const names = () => rows.columns.map((x) => x.name).join(", ")
  const timeIdx =
    c.time !== undefined
      ? columnIndex(rows, c.time)
      : firstColumnOf(rows, "temporal")
  const endIdx = c.end !== undefined ? columnIndex(rows, c.end) : -1
  const laneIdx =
    c.lane !== undefined
      ? columnIndex(rows, c.lane)
      : firstColumnOf(rows, "categorical")
  const stateIdx =
    c.state !== undefined
      ? columnIndex(rows, c.state)
      : rows.columns.findIndex(
          (_, i) => i !== timeIdx && i !== laneIdx && i !== endIdx,
        )
  for (const [idx, role, set] of [
    [timeIdx, "time", c.time],
    [laneIdx, "lane", c.lane],
    [stateIdx, "state", c.state],
    [endIdx, "end", c.end],
  ] as const) {
    if (idx < 0 && (role !== "end" || set !== undefined))
      return `${role}: column ${JSON.stringify(set ?? `(default ${role})`)} not found. Columns: ${names()}.`
  }

  const laneRows = new Map<string, number[]>()
  const open: (Omit<Segment, "end"> & { end: number | null })[] = []
  rows.rows.forEach((row, index) => {
    const start = toTime(row[timeIdx])
    if (start === null) return
    const lane = toLabel(row[laneIdx])
    const read = laneRows.get(lane)
    if (read) read.push(index)
    else laneRows.set(lane, [index])
    open.push({
      lane,
      state: toLabel(row[stateIdx]),
      start,
      end: endIdx >= 0 ? toTime(row[endIdx]) : null,
      row: index,
    })
  })
  if (open.length === 0) return "No row has a valid time."
  const to = Math.max(...open.map((s) => s.end ?? s.start))
  const from = Math.min(...open.map((s) => s.start))
  const byLane = new Map<string, typeof open>()
  for (const s of open) {
    const lane = byLane.get(s.lane)
    if (lane) lane.push(s)
    else byLane.set(s.lane, [s])
  }
  const segments: Segment[] = []
  for (const list of byLane.values()) {
    list.sort((a, b) => a.start - b.start)
    list.forEach((s, i) =>
      segments.push({ ...s, end: s.end ?? list[i + 1]?.start ?? to }),
    )
  }
  return {
    lanes: [...byLane.keys()].sort(naturalOrder),
    states: [...new Set(segments.map((s) => s.state))],
    segments,
    laneColumn: laneIdx,
    laneRows,
    from,
    to,
  }
}

export const latestStateByLane = (segments: Span[]): Map<string, string> => {
  const latest = new Map<string, Span>()
  for (const segment of segments) {
    const previous = latest.get(segment.lane)
    if (!previous || segment.start >= previous.start)
      latest.set(segment.lane, segment)
  }
  return new Map([...latest].map(([lane, segment]) => [lane, segment.state]))
}

export type Bucket = {
  from: number
  to: number
  /** Milliseconds spent in each state inside the bucket. */
  time: Map<string, number>
}

/** Splits [from, to) into equal buckets and adds up each lane's state time. */
export const bucketLanes = (
  read: Pick<StateSegments, "lanes" | "states" | "from" | "to"> & {
    segments: Span[]
  },
  count: number,
): Map<string, Bucket[]> => {
  const n = Math.max(1, Math.floor(count))
  const width = Math.max(read.to - read.from, 1) / n
  const out = new Map<string, Bucket[]>()
  for (const lane of read.lanes) {
    out.set(
      lane,
      Array.from({ length: n }, (_, i) => ({
        from: read.from + i * width,
        to: read.from + (i + 1) * width,
        time: new Map(),
      })),
    )
  }
  const coveredUntil = new Map<string, Map<string, number>>()
  for (const s of [...read.segments].sort((a, b) => a.start - b.start)) {
    const buckets = out.get(s.lane)
    if (!buckets || s.end <= s.start) continue
    const lane = coveredUntil.get(s.lane) ?? new Map<string, number>()
    coveredUntil.set(s.lane, lane)
    const start = Math.max(s.start, lane.get(s.state) ?? -Infinity)
    if (s.end <= start) continue
    lane.set(s.state, s.end)
    const first = Math.max(0, Math.floor((start - read.from) / width))
    const last = Math.min(n - 1, Math.floor((s.end - read.from) / width))
    for (let i = first; i <= last; i++) {
      const b = buckets[i]
      const overlap = Math.min(s.end, b.to) - Math.max(start, b.from)
      if (overlap > 0) b.time.set(s.state, (b.time.get(s.state) ?? 0) + overlap)
    }
  }
  return out
}

/** The worst severity with any time in the bucket, or null for no data. */
export const bucketSeverity = (
  bucket: Bucket,
  overrides?: Record<string, Severity>,
): Severity | null => {
  let worst: Severity | null = null
  for (const [state, ms] of bucket.time) {
    if (ms <= 0) continue
    const s = severityOf(state, overrides)
    if (worst === null || SEVERITY_RANK[s] > SEVERITY_RANK[worst]) worst = s
  }
  return worst
}

/** Share of distinct covered time with no bad state, by lane. */
export const uptimeByLane = (
  segments: Span[],
  overrides?: Record<string, Severity>,
): Map<string, number> => {
  const totals = new Map<
    string,
    { covered: number; coveredTo: number; down: number; downTo: number }
  >()
  for (const { lane, state, start, end } of [...segments].sort(
    (a, b) => a.start - b.start,
  )) {
    if (end <= start) continue
    const total = totals.get(lane) ?? {
      covered: 0,
      coveredTo: -Infinity,
      down: 0,
      downTo: -Infinity,
    }
    total.covered += Math.max(0, end - Math.max(start, total.coveredTo))
    total.coveredTo = Math.max(end, total.coveredTo)
    if (severityOf(state, overrides) === "bad") {
      total.down += Math.max(0, end - Math.max(start, total.downTo))
      total.downTo = Math.max(end, total.downTo)
    }
    totals.set(lane, total)
  }
  return new Map(
    [...totals].map(([lane, { covered, down }]) => [lane, 1 - down / covered]),
  )
}
