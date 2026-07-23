import type { QueryExecResult } from "../../../../hooks/useQueryExecution"
import { runAdaptivePollLoop } from "../../../../hooks/useAdaptivePoll"
import { sleep } from "../../../../utils/sleep"
import { createLimiter } from "../../../../utils/limiter"
import type {
  AutoRefresh,
  CellResult,
  NotebookCell,
  SingleQueryResult,
} from "../../../../store/notebook"
import type { ValidateQueryResult } from "../../../../utils/questdb/types"
import { eventBus } from "../../../../modules/EventBus"
import { EventType } from "../../../../modules/EventBus/types"
import { getQueriesFromText, normalizeQueryText } from "../../Monaco/utils"
import {
  autoRefreshIntervalMs,
  NOTEBOOK_ROW_CAP,
  singleResultFromExec,
  sqlHash,
} from "../notebookUtils"
import {
  type ChartResult,
  resultsEquivalent,
  successResults,
  toChartResult,
  toExecResult,
} from "../DrawCanvas/drawCanvasUtils"
import type { CellResultStatus } from "../resultHydration/cellResultHydration"
import { deleteCellSnapshot } from "../../../../store/notebookResults"
import { persistCellSnapshot } from "../persistCellSnapshot"
import { PerKeyListeners } from "../perKeyListeners"

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
  fetching: boolean
  settledKey: string | null
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
  setCellResult: (cellId: string, result: CellResult | undefined) => void
  getCellResult: (cellId: string) => CellResult | null | undefined
  isDrawCell: (cellId: string) => boolean
  resultLoadStatus: (cellId: string) => CellResultStatus
  subscribeResultLoad: (cellId: string, listener: () => void) => () => void
  requestResultLoad: (cellId: string) => void
  noteResultMissing: (cellId: string) => void
  onSnapshotPersisted: (cellId: string, results: SingleQueryResult[]) => void
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
    fetching: false,
    settledKey: null,
    classifyBlock: null,
  }
}

export const deriveChartLoading = (
  state: ChartFetchState,
  chartResult: ChartResult,
  resultLoading: boolean,
): { loading: boolean; refreshing: boolean } => {
  const hasData =
    chartResult.kind === "settled" && chartResult.results.length > 0
  const loading =
    state.queries.length > 0 &&
    state.classifyBlock === null &&
    !hasData &&
    (state.settledKey !== state.queriesKey ||
      resultLoading ||
      (state.fetching && chartResult.kind !== "settled"))
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
  ensureAttempted: boolean
  lastFetchedAt: number
  state: ChartFetchState
  classifyCache: Map<string, "DQL" | "DDL_DML">
  sqlDebounce: ReturnType<typeof setTimeout> | null
  pendingSql: string | null
  inFlight: AbortController | null
  poll: AbortController | null
  pollKey: string | null
  resultLoadUnsubscribe: (() => void) | null
  lastSnapshotAt: number
  persistedResults: WeakMap<SingleQueryResult[], string>
  lastClearedSqlHash: string | null
  pendingSnapshot: { results: SingleQueryResult[]; durationMs: number } | null
  snapshotTimer: ReturnType<typeof setTimeout> | null
}

export class ChartRefreshEngine {
  private entries = new Map<string, Entry>()
  private listeners = new PerKeyListeners()
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
    for (const cellId of [...this.entries.keys()]) {
      this.removeEntry(cellId, "teardown")
    }
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
    const cellIds = new Set(cells.map((cell) => cell.id))
    for (const cellId of [...this.entries.keys()]) {
      if (!present.has(cellId)) {
        this.removeEntry(
          cellId,
          cellIds.has(cellId) ? "modeExited" : "cellDeleted",
        )
      }
    }
    // Visibility follows the CELL, not the entry: a chart→grid→chart toggle
    // recreates the entry while the cell never leaves the viewport, so the
    // observer won't re-report it. Only a deleted cell drops its record.
    for (const cellId of [...this.visibilityByCell.keys()]) {
      if (!cellIds.has(cellId)) this.visibilityByCell.delete(cellId)
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

  requestHydrate(cellId: string) {
    const entry = this.entries.get(cellId)
    if (!entry || entry.ensureAttempted) return
    this.ensureData(entry)
  }

  private resume(entry: Entry) {
    this.ensureData(entry)
  }

  getState(cellId: string): ChartFetchState | undefined {
    return this.entries.get(cellId)?.state
  }

  subscribe(cellId: string, listener: () => void): () => void {
    return this.listeners.subscribe(cellId, listener)
  }

  private createEntry(cell: NotebookCell) {
    const entry: Entry = {
      cellId: cell.id,
      sql: cell.value,
      autoRefresh: cell.autoRefresh ?? true,
      state: pendingChartFetchState(cell.value),
      visible: this.visibilityByCell.get(cell.id) ?? false,
      ensureAttempted: false,
      lastFetchedAt: 0,
      classifyCache: new Map(),
      sqlDebounce: null,
      pendingSql: null,
      inFlight: null,
      poll: null,
      pollKey: null,
      resultLoadUnsubscribe: null,
      lastSnapshotAt: 0,
      persistedResults: new WeakMap(),
      lastClearedSqlHash: null,
      pendingSnapshot: null,
      snapshotTimer: null,
    }
    this.entries.set(cell.id, entry)
    if (entry.visible) this.ensureData(entry)
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

  private removeEntry(
    cellId: string,
    reason: "cellDeleted" | "modeExited" | "teardown",
  ) {
    const entry = this.entries.get(cellId)
    if (!entry) return
    if (entry.sqlDebounce) clearTimeout(entry.sqlDebounce)
    const pending = entry.pendingSnapshot
    this.dropPendingSnapshot(entry)
    if (reason === "teardown" && pending) {
      entry.lastSnapshotAt = 0
      this.queueSnapshot(entry, pending.results, pending.durationMs)
    }
    this.stopResultLoadWait(entry)
    entry.inFlight?.abort()
    entry.inFlight = null
    entry.poll?.abort()
    this.entries.delete(cellId)
    // Subscribers re-derive from the now-missing state and settle on idle, so
    // the toolbar is not stranded spinning after the entry is gone.
    this.notify(cellId)
  }

  private applySql(entry: Entry, sql: string) {
    entry.inFlight?.abort()
    entry.inFlight = null
    this.stopResultLoadWait(entry)
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
    if (entry.visible) this.ensureData(entry)
    else entry.ensureAttempted = false
  }

  // Settle from the data already in cell.result — the just-run grid, the
  // engine's own last frame, or a snapshot the hydration engine restored —
  // instead of re-querying. Waits for an in-flight snapshot load; falls back
  // to a live fetch when nothing usable exists for the CURRENT queries.
  //
  // Never runs for a cell outside the bands: creation and applySql defer it
  // until the retain band (requestHydrate) or a reveal (resume) asks — the
  // same mount/retain contract run-cell results follow.
  private ensureData(entry: Entry) {
    entry.ensureAttempted = true
    this.stopResultLoadWait(entry)
    const { queries, queriesKey, settledKey, classifyBlock } = entry.state
    if (queries.length === 0) {
      if (settledKey !== queriesKey) void this.fetchOnce(entry)
      this.updatePoll(entry)
      return
    }
    if (classifyBlock !== null && settledKey === queriesKey) {
      this.updatePoll(entry)
      return
    }
    const chartResult = toChartResult(
      this.getDeps().getCellResult(entry.cellId),
      queries,
    )
    if (
      chartResult.kind === "settled" &&
      (chartResult.results.length > 0 || settledKey === queriesKey)
    ) {
      this.setState(entry, { settledKey: queriesKey })
      entry.lastFetchedAt = chartResult.timestamp
      this.updatePoll(entry)
      return
    }
    if (this.getDeps().resultLoadStatus(entry.cellId) === "unrequested") {
      this.getDeps().requestResultLoad(entry.cellId)
    }
    if (this.getDeps().resultLoadStatus(entry.cellId) === "loading") {
      entry.resultLoadUnsubscribe = this.getDeps().subscribeResultLoad(
        entry.cellId,
        () => {
          const status = this.getDeps().resultLoadStatus(entry.cellId)
          if (
            status !== "loaded" &&
            status !== "missing" &&
            status !== "failed"
          )
            return
          this.stopResultLoadWait(entry)
          this.ensureData(entry)
        },
      )
      this.updatePoll(entry)
      return
    }
    if (this.shouldPoll(entry)) {
      // No usable data at this point — a poll still sleeping on a pre-release
      // lastFetchedAt must not defer the refetch, so restart the loop with an
      // immediate first tick.
      entry.lastFetchedAt = 0
      entry.poll?.abort()
      entry.poll = null
      entry.pollKey = null
      this.updatePoll(entry)
      return
    }
    if (entry.visible && !this.documentHidden) void this.fetchOnce(entry)
    this.updatePoll(entry)
  }

  private stopResultLoadWait(entry: Entry) {
    entry.resultLoadUnsubscribe?.()
    entry.resultLoadUnsubscribe = null
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
    this.stopResultLoadWait(entry)
    const { queries, queriesKey } = entry.state
    if (queries.length === 0) {
      this.setState(entry, {
        fetching: false,
        settledKey: queriesKey,
        classifyBlock: null,
      })
      this.clearCellData(entry)
      return
    }
    const ac = new AbortController()
    entry.inFlight = ac
    this.setState(entry, { fetching: true })
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
      if (ac.signal.aborted || !deps.isDrawCell(entry.cellId)) return
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
          settledKey: queriesKey,
        })
        // The cell now holds a write — drop any stale rows the grid would show.
        this.clearCellData(entry)
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
      if (ac.signal.aborted || !deps.isDrawCell(entry.cellId)) return
      // Compare against the CURRENT cell.result, not a retained copy — the
      // hydration engine may have released or replaced it since the last tick,
      // and an unchanged frame must still be re-written in that case.
      const currentSqlHash = sqlHash(entry.sql)
      const current = this.getDeps().getCellResult(entry.cellId)
      if (
        current != null &&
        resultsEquivalent(current.results.map(toExecResult), out)
      ) {
        this.setState(entry, { settledKey: queriesKey })
        if (successResults(out).length === 0) {
          this.clearSnapshot(entry)
          return
        }
        const persisted =
          entry.persistedResults.get(current.results) === currentSqlHash
        if (!persisted) {
          this.queueSnapshot(entry, current.results, fetchDurationMs)
        }
        return
      }
      // Write EVERY statement (not just chartable ones) so a switch to the grid
      // shows the same tabs a real run would — including errors and empty
      // results — instead of dropping them or leaving stale rows behind. The
      // result lands before settledKey flips: React 17 renders the two updates
      // separately, and a settled state without data would flash "No data".
      const written = out.map((r) => singleResultFromExec(r, r.query))
      this.getDeps().setCellResult(entry.cellId, {
        results: written,
        activeResultIndex: 0,
        timestamp: Date.now(),
      })
      this.setState(entry, { settledKey: queriesKey })
      if (successResults(out).length > 0) {
        this.queueSnapshot(entry, written, fetchDurationMs)
      } else {
        this.clearSnapshot(entry)
      }
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

  private clearCellData(entry: Entry) {
    this.getDeps().setCellResult(entry.cellId, undefined)
    this.getDeps().noteResultMissing(entry.cellId)
    this.clearSnapshot(entry)
  }

  // Persist a throttled copy of the chart's frame — shared with run mode (one
  // snapshot per cell) so the chart survives reload without re-fetch. A frame
  // blocked by the throttle is kept pending and saved when the window reopens,
  // so the final frame persists even when polling stops before the next tick.
  private queueSnapshot(
    entry: Entry,
    results: SingleQueryResult[],
    durationMs: number,
  ) {
    const now = Date.now()
    const throttledForMs = SNAPSHOT_THROTTLE_MS - (now - entry.lastSnapshotAt)
    if (throttledForMs > 0) {
      entry.pendingSnapshot = { results, durationMs }
      if (!entry.snapshotTimer) {
        entry.snapshotTimer = setTimeout(() => {
          entry.snapshotTimer = null
          const pending = entry.pendingSnapshot
          entry.pendingSnapshot = null
          if (pending && this.entries.get(entry.cellId) === entry) {
            this.queueSnapshot(entry, pending.results, pending.durationMs)
          }
        }, throttledForMs)
      }
      return
    }
    entry.lastSnapshotAt = now
    void this.persistSnapshot(entry, results, durationMs)
  }

  private persistSnapshot(
    entry: Entry,
    results: SingleQueryResult[],
    durationMs: number,
  ): Promise<void> {
    this.dropPendingSnapshot(entry)
    const persistedSqlHash = sqlHash(entry.sql)
    const failedCount = results.filter((r) => r.type === "error").length
    return persistCellSnapshot({
      bufferId: this.bufferId,
      cellId: entry.cellId,
      results,
      savedAt: Date.now(),
      activeResultIndex: 0,
      ...(results.length > 1
        ? {
            script: {
              successCount: results.length - failedCount,
              failedCount,
              durationMs,
            },
          }
        : {}),
    }).then((saved) => {
      if (!saved) return
      entry.persistedResults.set(results, persistedSqlHash)
      entry.lastClearedSqlHash = null
      this.getDeps().onSnapshotPersisted(entry.cellId, results)
    })
  }

  async flushPendingSnapshots(): Promise<void> {
    const writes: Promise<void>[] = []
    for (const entry of this.entries.values()) {
      const pending = entry.pendingSnapshot
      if (!pending) continue
      entry.lastSnapshotAt = Date.now()
      writes.push(
        this.persistSnapshot(entry, pending.results, pending.durationMs),
      )
    }
    await Promise.all(writes)
  }

  private clearSnapshot(entry: Entry) {
    this.dropPendingSnapshot(entry)
    const clearedSqlHash = sqlHash(entry.sql)
    if (entry.lastClearedSqlHash === clearedSqlHash) return
    void deleteCellSnapshot(this.bufferId, entry.cellId).then(
      () => {
        entry.lastClearedSqlHash = clearedSqlHash
      },
      () => undefined,
    )
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
    this.listeners.notify(cellId)
  }
}
