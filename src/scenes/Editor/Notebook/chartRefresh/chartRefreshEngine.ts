import type { QueryExecResult } from "../../../../hooks/useQueryExecution"
import { runAdaptivePollLoop } from "../../../../hooks/useAdaptivePoll"
import { sleep } from "../../../../utils/sleep"
import { createLimiter } from "../../../../utils/limiter"
import type {
  AutoRefresh,
  CellResult,
  NotebookCell,
} from "../../../../store/notebook"
import type { ValidateQueryResult } from "../../../../utils/questdb/types"
import { eventBus } from "../../../../modules/EventBus"
import { EventType } from "../../../../modules/EventBus/types"
import { getQueriesFromText, normalizeQueryText } from "../../Monaco/utils"
import {
  autoRefreshIntervalMs,
  capResultBytes,
  NOTEBOOK_BYTE_CAP,
  NOTEBOOK_ROW_CAP,
  singleResultFromExec,
  sqlHash,
} from "../notebookUtils"
import {
  resultMatchesQueries,
  resultsEquivalent,
  successResults,
  toExecResult,
} from "../DrawCanvas/drawCanvasUtils"
import {
  deleteCellSnapshot,
  loadCellSnapshot,
} from "../../../../store/notebookResults"
import { persistCellSnapshot } from "../persistCellSnapshot"

const REFRESH_MIN_MS = 2000
const REFRESH_MAX_MS = 60000
const SQL_DEBOUNCE_MS = 300
// Draw auto-refresh can poll every few seconds; throttle snapshot writes so a
// live chart doesn't churn IndexedDB. A reload restores the last saved frame.
const SNAPSHOT_THROTTLE_MS = 10000
const MAX_CONCURRENT_FETCHES = 6
const INITIAL_FETCH_JITTER_MS = 300

export type ChartClassifyBlock =
  | { kind: "write"; queryType: string }
  | { kind: "failed"; message: string }

export type ChartFetchState = {
  queries: string[]
  queriesKey: string
  results: QueryExecResult[]
  fetching: boolean
  settledKey: string | null
  lastFetchHadError: boolean
  classifyBlock: ChartClassifyBlock | null
}

export type ChartRefreshDeps = {
  executeSingle: (
    sql: string,
    signal?: AbortSignal,
    limit?: number,
  ) => Promise<QueryExecResult>
  validateWithGlobals: (
    sql: string,
    signal?: AbortSignal,
  ) => Promise<ValidateQueryResult>
  mirrorCellResult: (cellId: string, result: CellResult | undefined) => void
  getCellResult: (cellId: string) => CellResult | null | undefined
}

const QUERIES_KEY_SEPARATOR = "\u0001"

const joinQueriesKey = (queries: string[]): string =>
  queries.join(QUERIES_KEY_SEPARATOR)

const normalizedQueriesKey = (queriesKey: string): string =>
  queriesKey
    .split(QUERIES_KEY_SEPARATOR)
    .map(normalizeQueryText)
    .join(QUERIES_KEY_SEPARATOR)

export const pendingChartFetchState = (sql: string): ChartFetchState => {
  const queries = getQueriesFromText(sql)
  return {
    queries,
    queriesKey: joinQueriesKey(queries),
    results: [],
    fetching: false,
    settledKey: null,
    lastFetchHadError: false,
    classifyBlock: null,
  }
}

export const deriveChartLoading = (
  state: ChartFetchState,
): { loading: boolean; refreshing: boolean } => {
  const loading =
    state.queries.length > 0 &&
    state.classifyBlock === null &&
    state.settledKey !== state.queriesKey &&
    state.results.length === 0
  return { loading, refreshing: state.fetching && !loading }
}

const errorMessage = (cause: unknown): string => {
  if (typeof cause === "string" && cause) return cause
  if (cause instanceof Error && cause.message) return cause.message
  return "Query failed"
}

const errorExecResult = (query: string, cause: unknown): QueryExecResult => ({
  type: "error",
  query,
  columns: [],
  dataset: [],
  count: 0,
  error: errorMessage(cause),
})

export type ChartRefreshEngineOptions = {
  maxConcurrentFetches?: number
  initialFetchJitterMs?: number
}

type DrawCellSyncKey = Pick<NotebookCell, "id" | "value" | "autoRefresh">

const sameDrawCells = (
  previous: DrawCellSyncKey[],
  drawCells: NotebookCell[],
): boolean =>
  previous.length === drawCells.length &&
  drawCells.every(
    (cell, index) =>
      previous[index].id === cell.id &&
      previous[index].value === cell.value &&
      previous[index].autoRefresh === cell.autoRefresh,
  )

type Entry = {
  cellId: string
  sql: string
  autoRefresh: AutoRefresh
  visible: boolean
  lastFetchedAt: number
  state: ChartFetchState
  classifyCache: Map<string, "DQL" | "DDL_DML">
  sqlDebounce: ReturnType<typeof setTimeout> | null
  pendingSql: string | null
  inFlight: AbortController | null
  poll: AbortController | null
  pollKey: string | null
  lastSnapshotAt: number
  lastSaved: { sqlHash: string; results: QueryExecResult[] } | null
  pendingSnapshot: { results: QueryExecResult[]; durationMs: number } | null
  snapshotTimer: ReturnType<typeof setTimeout> | null
  // Last results mirrored into cell.result, so the grid shows the chart's
  // current data on switch-back; guards against redundant cell writes.
  lastMirror: QueryExecResult[]
}

export class ChartRefreshEngine {
  private entries = new Map<string, Entry>()
  private listeners = new Map<string, Set<() => void>>()
  private visibilityByCell = new Map<string, boolean>()
  private lastSyncedDrawCells: DrawCellSyncKey[] | null = null
  private documentHidden = false
  private limitFetch: <T>(task: () => Promise<T>) => Promise<T>
  private initialFetchJitterMs: number

  private refreshHandler = (payload?: { cellId?: string }) => {
    if (payload?.cellId) this.refresh(payload.cellId)
  }

  private documentVisibilityHandler = () => {
    const hidden = document.hidden
    if (hidden === this.documentHidden) return
    this.documentHidden = hidden
    for (const entry of this.entries.values()) {
      if (hidden) this.updatePoll(entry)
      else if (entry.visible) this.resume(entry)
    }
  }

  constructor(
    private bufferId: number,
    private getDeps: () => ChartRefreshDeps,
    options: ChartRefreshEngineOptions = {},
  ) {
    this.limitFetch = createLimiter(
      options.maxConcurrentFetches ?? MAX_CONCURRENT_FETCHES,
    )
    this.initialFetchJitterMs =
      options.initialFetchJitterMs ?? INITIAL_FETCH_JITTER_MS
  }

  attach() {
    eventBus.subscribe(
      EventType.NOTEBOOK_CELL_REFRESH_CHART,
      this.refreshHandler,
    )
    if (typeof document !== "undefined") {
      this.documentHidden = document.hidden
      document.addEventListener(
        "visibilitychange",
        this.documentVisibilityHandler,
      )
    }
  }

  destroy() {
    eventBus.unsubscribe(
      EventType.NOTEBOOK_CELL_REFRESH_CHART,
      this.refreshHandler,
    )
    if (typeof document !== "undefined") {
      document.removeEventListener(
        "visibilitychange",
        this.documentVisibilityHandler,
      )
    }
    for (const cellId of [...this.entries.keys()]) this.removeEntry(cellId)
    this.visibilityByCell.clear()
    this.lastSyncedDrawCells = null
  }

  sync(cells: NotebookCell[]) {
    const drawCells = cells.filter((cell) => cell.mode === "draw")
    if (
      this.lastSyncedDrawCells &&
      sameDrawCells(this.lastSyncedDrawCells, drawCells)
    )
      return
    this.lastSyncedDrawCells = drawCells.map(({ id, value, autoRefresh }) => ({
      id,
      value,
      autoRefresh,
    }))
    const present = new Set<string>()
    for (const cell of drawCells) {
      present.add(cell.id)
      const entry = this.entries.get(cell.id)
      if (entry) this.updateEntry(entry, cell)
      else this.createEntry(cell)
    }
    for (const cellId of [...this.entries.keys()]) {
      if (!present.has(cellId)) this.removeEntry(cellId)
    }
  }

  refresh(cellId: string) {
    const entry = this.entries.get(cellId)
    if (entry) void this.fetchOnce(entry)
  }

  // Called by the notebook's cell visibility observer. Hiding pauses the poll
  // (in-flight fetches finish and land); revealing resumes it, fetching
  // immediately when the data is older than the cell's interval.
  setVisible(cellId: string, visible: boolean) {
    this.visibilityByCell.set(cellId, visible)
    const entry = this.entries.get(cellId)
    if (!entry || entry.visible === visible) return
    entry.visible = visible
    if (visible) this.resume(entry)
    else this.updatePoll(entry)
  }

  setOnlyVisible(cellIds: string[]) {
    const visible = new Set(cellIds)
    for (const cellId of this.entries.keys()) {
      if (!visible.has(cellId)) this.setVisible(cellId, false)
    }
    for (const cellId of cellIds) this.setVisible(cellId, true)
  }

  private resume(entry: Entry) {
    if (this.shouldAutoRefresh(entry)) {
      this.updatePoll(entry)
      return
    }
    // Auto-refresh is off and the CURRENT queries have never settled — the
    // deferred initial fetch, or the catch-up for SQL that changed while the
    // cell was hidden (settledKey then still holds the old queries' key).
    if (
      entry.state.settledKey !== entry.state.queriesKey &&
      entry.state.queries.length > 0
    ) {
      void this.fetchOnce(entry)
    }
  }

  getState(cellId: string): ChartFetchState | undefined {
    return this.entries.get(cellId)?.state
  }

  subscribe(cellId: string, listener: () => void) {
    let set = this.listeners.get(cellId)
    if (!set) {
      set = new Set()
      this.listeners.set(cellId, set)
    }
    set.add(listener)
  }

  unsubscribe(cellId: string, listener: () => void) {
    const set = this.listeners.get(cellId)
    if (!set) return
    set.delete(listener)
    if (set.size === 0) this.listeners.delete(cellId)
  }

  private createEntry(cell: NotebookCell) {
    const queries = getQueriesFromText(cell.value)
    const entry: Entry = {
      cellId: cell.id,
      sql: cell.value,
      autoRefresh: cell.autoRefresh ?? true,
      state: {
        queries,
        queriesKey: joinQueriesKey(queries),
        results: [],
        fetching: false,
        settledKey: null,
        lastFetchHadError: false,
        classifyBlock: null,
      },
      visible: this.visibilityByCell.get(cell.id) ?? false,
      lastFetchedAt: 0,
      classifyCache: new Map(),
      sqlDebounce: null,
      pendingSql: null,
      inFlight: null,
      poll: null,
      pollKey: null,
      lastSnapshotAt: 0,
      lastSaved: null,
      pendingSnapshot: null,
      snapshotTimer: null,
      lastMirror: [],
    }
    this.entries.set(cell.id, entry)
    this.hydrate(entry)
  }

  private updateEntry(entry: Entry, cell: NotebookCell) {
    const autoRefresh = cell.autoRefresh ?? true
    if (autoRefresh !== entry.autoRefresh) {
      entry.autoRefresh = autoRefresh
      this.updatePoll(entry)
    }
    const target = entry.pendingSql ?? entry.sql
    if (cell.value === target) return
    entry.pendingSql = cell.value
    if (entry.sqlDebounce) clearTimeout(entry.sqlDebounce)
    entry.sqlDebounce = setTimeout(() => {
      entry.sqlDebounce = null
      const sql = entry.pendingSql
      entry.pendingSql = null
      if (sql != null && sql !== entry.sql) this.applySql(entry, sql)
    }, SQL_DEBOUNCE_MS)
  }

  private removeEntry(cellId: string) {
    const entry = this.entries.get(cellId)
    if (!entry) return
    if (entry.sqlDebounce) clearTimeout(entry.sqlDebounce)
    this.dropPendingSnapshot(entry)
    entry.inFlight?.abort()
    entry.inFlight = null
    entry.poll?.abort()
    this.entries.delete(cellId)
    this.visibilityByCell.delete(cellId)
    // Subscribers re-derive from the now-missing state and settle on idle, so
    // the toolbar is not stranded spinning after the entry is gone.
    this.notify(cellId)
  }

  private applySql(entry: Entry, sql: string) {
    entry.inFlight?.abort()
    entry.inFlight = null
    entry.sql = sql
    entry.classifyCache = new Map()
    entry.lastFetchedAt = 0
    // The snapshot throttle window belongs to the previous SQL, and so does a
    // pending frame it blocked — the next save must not inherit either.
    entry.lastSnapshotAt = 0
    this.dropPendingSnapshot(entry)
    const queries = getQueriesFromText(sql)
    const queriesKey = joinQueriesKey(queries)
    const sameQueries =
      entry.state.settledKey !== null &&
      normalizedQueriesKey(entry.state.settledKey) ===
        normalizedQueriesKey(queriesKey)
    this.setState(entry, {
      queries,
      queriesKey,
      fetching: false,
      ...(sameQueries ? { settledKey: queriesKey } : {}),
    })
    this.hydrate(entry)
  }

  // Populate the entry from existing data instead of re-querying:
  //   1. cell.result — the just-run grid, or the chart's own mirrored frame.
  //      Transfers the data when toggling grid↔chart (no spinner, no re-run).
  //   2. the persisted snapshot — survives reload (cell.result is stripped).
  // autoRefresh-off cells then stay on that frame; autoRefresh-on cells let the
  // poll refresh in the background. Falls back to a live fetch when neither has
  // chartable rows. Only data produced by the CURRENT queries is used — a
  // result left over from edited-but-not-rerun SQL is stale and must re-fetch.
  private hydrate(entry: Entry) {
    const { queries, queriesKey } = entry.state
    const existing = this.getDeps().getCellResult(entry.cellId)
    const transferred = resultMatchesQueries(existing, queries)
      ? successResults(existing.results.map(toExecResult))
      : []
    if (transferred.length > 0) {
      this.setState(entry, {
        results:
          entry.state.results.length > 0 ? entry.state.results : transferred,
        settledKey: queriesKey,
      })
      entry.lastFetchedAt = Date.now()
      this.updatePoll(entry)
      return
    }
    const sqlAtStart = entry.sql
    void (async () => {
      // Best-effort: a failed read falls through to a live fetch instead of
      // leaving the chart on its loading spinner forever.
      const snap = await loadCellSnapshot(this.bufferId, entry.cellId).catch(
        () => undefined,
      )
      if (this.entries.get(entry.cellId) !== entry || entry.sql !== sqlAtStart)
        return
      const snapResult = snap && {
        results: snap.results,
        activeResultIndex: 0,
        timestamp: snap.savedAt,
      }
      if (resultMatchesQueries(snapResult, queries)) {
        const hydratedAll = snapResult.results.map(toExecResult)
        const hydrated = successResults(hydratedAll)
        if (hydrated.length > 0) {
          // Don't clobber live data that may already have landed — mirror
          // included: a poll fetch racing this read may have mirrored fresher
          // rows into cell.result while the snapshot was still loading.
          if (entry.state.results.length === 0) {
            this.setState(entry, { results: hydrated, settledKey: queriesKey })
            // Seed cell.result with EVERY statement, not just the chartable
            // ones, so a switch to the grid shows the same tabs a real run
            // would — matching runFetch's mirror(out)
            this.mirror(entry, hydratedAll)
          }
          return
        }
      }
      if (entry.state.settledKey === entry.state.queriesKey) return
      if (
        !this.shouldAutoRefresh(entry) &&
        entry.visible &&
        !this.documentHidden
      ) {
        void this.fetchOnce(entry)
      }
    })()
    this.updatePoll(entry)
  }

  private shouldAutoRefresh(entry: Entry): boolean {
    return entry.autoRefresh !== false && entry.state.queries.length > 0
  }

  private shouldPoll(entry: Entry): boolean {
    return (
      this.shouldAutoRefresh(entry) && entry.visible && !this.documentHidden
    )
  }

  private updatePoll(entry: Entry) {
    const enabled = this.shouldPoll(entry)
    const key = enabled
      ? `${entry.state.queriesKey}\u0001${String(entry.autoRefresh)}`
      : null
    if (entry.pollKey === key) return
    entry.poll?.abort()
    entry.poll = null
    entry.pollKey = key
    if (!enabled) return
    const abort = new AbortController()
    entry.poll = abort
    void this.runPollLoop(entry, abort)
  }

  // The jitter offsets each loop's start so charts starting together don't tick together.
  private async runPollLoop(entry: Entry, abort: AbortController) {
    if (this.initialFetchJitterMs > 0) {
      const jitter = Math.random() * this.initialFetchJitterMs
      const aborted = await sleep(jitter, abort.signal)
      if (aborted) return
    }
    const fixed = autoRefreshIntervalMs(entry.autoRefresh)
    const skipInitialFetch =
      Date.now() - entry.lastFetchedAt < (fixed ?? REFRESH_MIN_MS)
    await runAdaptivePollLoop({
      fetchFn: () => this.fetchOnce(entry),
      signal: abort.signal,
      minIntervalMs: fixed ?? REFRESH_MIN_MS,
      maxIntervalMs: fixed ?? REFRESH_MAX_MS,
      skipInitialFetch,
    })
  }

  private async fetchOnce(entry: Entry): Promise<number | void> {
    // Supersede any in-flight fetch up front, so a slow earlier response can't
    // land after the query changed — including when it's cleared to empty.
    entry.inFlight?.abort()
    entry.inFlight = null
    const { queries, queriesKey } = entry.state
    if (queries.length === 0) {
      this.setState(entry, {
        results: [],
        fetching: false,
        settledKey: queriesKey,
        lastFetchHadError: false,
        classifyBlock: null,
      })
      // No query → drop the grid mirror and the saved frame too.
      this.mirror(entry, [])
      this.clearSnapshot(entry)
      return
    }
    const ac = new AbortController()
    entry.inFlight = ac
    this.setState(entry, {
      fetching: true,
      ...(entry.state.results.length > 0 &&
      entry.state.settledKey !== queriesKey
        ? { results: [] }
        : {}),
    })
    return this.limitFetch(async () => {
      if (ac.signal.aborted) return
      const start = performance.now()
      await this.runFetch(entry, ac)
      return performance.now() - start
    })
  }

  private async runFetch(entry: Entry, ac: AbortController) {
    const deps = this.getDeps()
    const { queries, queriesKey } = entry.state
    try {
      // Runtime backstop: a user typing DDL into an already-draw cell would
      // otherwise reach executeSingle on the next poll tick. A query failing
      // validation is neither cached nor executed — re-validating it every
      // tick means an INSERT whose missing table appears later classifies as
      // a write and gets blocked, instead of silently running.
      const validationErrors = new Map<string, string>()
      try {
        await Promise.all(
          queries.map(async (q) => {
            if (entry.classifyCache.has(q)) return
            const res = await deps.validateWithGlobals(q, ac.signal)
            if ("error" in res) validationErrors.set(q, res.error)
            else if ("columns" in res) entry.classifyCache.set(q, "DQL")
            else entry.classifyCache.set(q, "DDL_DML")
          }),
        )
      } catch (e) {
        if (ac.signal.aborted) return
        const message = e instanceof Error ? e.message : "validate failed"
        this.setState(entry, {
          classifyBlock: { kind: "failed", message },
          settledKey: queriesKey,
        })
        return
      }
      if (ac.signal.aborted) return
      const offender = queries
        .map((q) => ({ q, klass: entry.classifyCache.get(q) }))
        .find((x) => x.klass === "DDL_DML")
      if (offender) {
        const validateResult = await deps
          .validateWithGlobals(offender.q, ac.signal)
          .catch(() => null)
        if (ac.signal.aborted) return
        const queryType =
          validateResult && "queryType" in validateResult
            ? validateResult.queryType
            : "write"
        this.setState(entry, {
          classifyBlock: { kind: "write", queryType },
          results: [],
          lastFetchHadError: false,
          settledKey: queriesKey,
        })
        // The cell now holds a write — drop any stale rows the grid would show.
        this.mirror(entry, [])
        return
      }
      if (entry.state.classifyBlock !== null) {
        this.setState(entry, { classifyBlock: null })
      }
      const fetchStartedAt = Date.now()
      const out = await Promise.all(
        queries.map((q) => {
          const validationError = validationErrors.get(q)
          if (validationError !== undefined)
            return Promise.resolve(errorExecResult(q, validationError))
          return deps
            .executeSingle(q, ac.signal, NOTEBOOK_ROW_CAP)
            .catch((e) => errorExecResult(q, e))
        }),
      )
      const fetchDurationMs = Date.now() - fetchStartedAt
      if (ac.signal.aborted) return
      // One deep comparison per tick: a frame identical to the last mirrored
      // one implies results, snapshot and mirror are all already current, so
      // the unchanged-frame path skips their per-target re-comparisons.
      const outUnchanged =
        entry.lastMirror.length > 0 && resultsEquivalent(entry.lastMirror, out)
      if (outUnchanged) {
        this.setState(entry, {
          lastFetchHadError: out.some((r) => r.type === "error"),
          settledKey: queriesKey,
        })
        return
      }
      const next = successResults(out)
      this.setState(entry, {
        results: resultsEquivalent(entry.state.results, next)
          ? entry.state.results
          : next,
        lastFetchHadError: out.some((r) => r.type === "error"),
        settledKey: queriesKey,
      })
      if (next.length > 0) this.saveSnapshot(entry, out, fetchDurationMs)
      else this.clearSnapshot(entry)
      // Mirror EVERY statement (not just chartable ones) so a switch to the grid
      // shows the same tabs a real run would — including errors and empty
      // results — instead of dropping them or leaving stale rows behind.
      this.mirror(entry, out)
    } finally {
      // Only clear when still the active fetch — a superseded (aborted) run
      // must not flip `fetching` off while its replacement is in flight.
      if (entry.inFlight === ac) {
        entry.inFlight = null
        entry.lastFetchedAt = Date.now()
        this.setState(entry, { fetching: false })
      }
    }
  }

  private mirror(entry: Entry, next: QueryExecResult[]) {
    if (resultsEquivalent(entry.lastMirror, next)) return
    entry.lastMirror = next
    this.getDeps().mirrorCellResult(
      entry.cellId,
      next.length === 0
        ? undefined
        : {
            results: next.map((r) =>
              capResultBytes(
                singleResultFromExec(r, r.query),
                NOTEBOOK_BYTE_CAP,
              ),
            ),
            activeResultIndex: 0,
            timestamp: Date.now(),
          },
    )
  }

  // Persist a bounded, throttled copy of the chart's frame — shared with run
  // mode (one snapshot per cell) so the chart survives reload without re-fetch.
  // Frames identical to the last saved one are skipped; a changed frame blocked
  // by the throttle is kept pending and saved when the window reopens, so the
  // final frame persists even when polling stops before the next tick.
  private saveSnapshot(
    entry: Entry,
    execResults: QueryExecResult[],
    durationMs: number,
  ) {
    const currentSqlHash = sqlHash(entry.sql)
    const last = entry.lastSaved
    if (
      last &&
      last.sqlHash === currentSqlHash &&
      resultsEquivalent(last.results, execResults)
    ) {
      this.dropPendingSnapshot(entry)
      return
    }
    const now = Date.now()
    const throttledForMs = SNAPSHOT_THROTTLE_MS - (now - entry.lastSnapshotAt)
    if (throttledForMs > 0) {
      entry.pendingSnapshot = { results: execResults, durationMs }
      if (!entry.snapshotTimer) {
        entry.snapshotTimer = setTimeout(() => {
          entry.snapshotTimer = null
          const pending = entry.pendingSnapshot
          entry.pendingSnapshot = null
          if (pending && this.entries.get(entry.cellId) === entry) {
            this.saveSnapshot(entry, pending.results, pending.durationMs)
          }
        }, throttledForMs)
      }
      return
    }
    this.dropPendingSnapshot(entry)
    entry.lastSnapshotAt = now
    entry.lastSaved = { sqlHash: currentSqlHash, results: execResults }
    const results = execResults.map((r) =>
      capResultBytes(singleResultFromExec(r, r.query), NOTEBOOK_BYTE_CAP),
    )
    const failedCount = execResults.filter((r) => r.type === "error").length
    void persistCellSnapshot({
      bufferId: this.bufferId,
      cellId: entry.cellId,
      results,
      savedAt: now,
      activeResultIndex: 0,
      ...(execResults.length > 1
        ? {
            script: {
              successCount: execResults.length - failedCount,
              failedCount,
              durationMs,
            },
          }
        : {}),
    })
  }

  private clearSnapshot(entry: Entry) {
    this.dropPendingSnapshot(entry)
    const currentSqlHash = sqlHash(entry.sql)
    const last = entry.lastSaved
    if (last && last.sqlHash === currentSqlHash && last.results.length === 0)
      return
    entry.lastSaved = { sqlHash: currentSqlHash, results: [] }
    void deleteCellSnapshot(this.bufferId, entry.cellId)
  }

  private dropPendingSnapshot(entry: Entry) {
    entry.pendingSnapshot = null
    if (entry.snapshotTimer) {
      clearTimeout(entry.snapshotTimer)
      entry.snapshotTimer = null
    }
  }

  private setState(entry: Entry, patch: Partial<ChartFetchState>) {
    entry.state = { ...entry.state, ...patch }
    this.notify(entry.cellId)
  }

  private notify(cellId: string) {
    this.listeners.get(cellId)?.forEach((listener) => listener())
  }
}
