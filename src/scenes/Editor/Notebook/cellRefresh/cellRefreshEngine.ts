import type { QueryExecResult } from "../../../../hooks/useQueryExecution"
import { runAdaptivePollLoop } from "../../../../hooks/useAdaptivePoll"
import { sleep } from "../../../../utils/sleep"
import type {
  AutoRefresh,
  CellResult,
  NotebookCell,
  SingleQueryResult,
} from "../../../../store/notebook"
import type { ValidateQueryResult } from "../../../../utils/questdb/types"
import {
  classifyStatements,
  type ClassifiedStatement,
} from "../../../../utils/tools/permissions"
import {
  statementRequestLimiter,
  type RequestLimiter,
} from "../../../../utils/questdb/requestLimiter"
import { eventBus } from "../../../../modules/EventBus"
import { EventType } from "../../../../modules/EventBus/types"
import { getQueriesFromText, normalizeQueryText } from "../../Monaco/utils"
import {
  autoRefreshIntervalMs,
  NOTEBOOK_ROW_CAP,
  reconcileCellResultForValue,
  resolveAutoRefresh,
  singleResultFromExec,
  sqlHash,
  statementKeysFor,
  type StatementKey,
} from "../notebookUtils"
import {
  type ChartResult,
  resultsEquivalent,
  successResults,
  toChartResult,
  toExecResult,
} from "../DrawCanvas/drawCanvasUtils"
import {
  hasRunMarker,
  type CellResultStatus,
} from "../resultHydration/cellResultHydration"
import type { CellRefreshView as CellRefreshAgentView } from "../../../../utils/notebooks/notebookController/notebookController"
import { deleteCellSnapshot } from "../../../../store/notebookResults"
import { persistCellSnapshot } from "../persistCellSnapshot"
import { PerKeyListeners } from "../perKeyListeners"

const REFRESH_MIN_MS = 2000
const REFRESH_MAX_MS = 60000
const SQL_DEBOUNCE_MS = 300
// Auto-refresh can poll every few seconds; throttle snapshot writes so a live
// cell doesn't churn IndexedDB. A reload restores the last saved frame. A
// round that leaves failures bypasses the throttle: the failure state must
// survive an immediate reload.
const SNAPSHOT_THROTTLE_MS = 10000
const INITIAL_FETCH_JITTER_MS = 300

export type CellEntryKind = "chart" | "grid"

export type CellClassifyBlock =
  | { kind: "write"; queryType: string }
  | { kind: "failed"; message: string }

export type CellFetchState = {
  queries: string[]
  queriesKey: string
  fetching: boolean
  settledKey: string | null
  classifyBlock: CellClassifyBlock | null
  // The queriesKey the last completed classification described. While an
  // edited cell awaits reclassification the UI keeps showing the last known
  // class; the fresh barrier classification stays the enforcement gate.
  classifiedKey: string | null
  // Per-statement refresh channel. Grid slots report their own in-flight and
  // failure state here (old rows stay visible); chart entries re-derive
  // slotErrors from their settled frame so both views feed one
  // last_refresh_error surface.
  slotFetching: ReadonlySet<StatementKey>
  slotErrors: ReadonlyMap<StatementKey, string>
  cancelledSlots: ReadonlySet<StatementKey>
  // Wall-clock of each slot's last successful settle. Freshness is per tab:
  // after a partial round the succeeded slots are newer than their siblings.
  // Memory-only — a reload falls back to the frame's saved time.
  slotFetchedAt: ReadonlyMap<StatementKey, number>
}

export type CellRefreshDeps = {
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
  isCellRunning: (cellId: string) => boolean
  resultLoadStatus: (cellId: string) => CellResultStatus
  subscribeResultLoad: (cellId: string, listener: () => void) => () => void
  requestResultLoad: (cellId: string) => void
  noteResultMissing: (cellId: string) => void
  reviveResultLoad: (cellId: string) => void
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

export const pendingCellFetchState = (sql: string): CellFetchState => {
  const queries = getQueriesFromText(sql)
  return {
    queries,
    queriesKey: joinQueriesKey(queries),
    fetching: false,
    settledKey: null,
    classifyBlock: null,
    classifiedKey: null,
    slotFetching: new Set(),
    slotErrors: new Map(),
    cancelledSlots: new Set(),
    slotFetchedAt: new Map(),
  }
}

export const deriveChartLoading = (
  state: CellFetchState,
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

export type CellRefreshEngineOptions = {
  initialFetchJitterMs?: number
  requestLimiter?: RequestLimiter
  // React 17 renders each state update in an async continuation separately;
  // the provider passes unstable_batchedUpdates so a slot settle costs one
  // render pass instead of one per subscriber.
  batchUpdates?: (fn: () => void) => void
}

// Editor-only cells are never entries: charts are entries by mode, grids only
// while they show (or expect) a result frame. The grid engine never
// bootstraps — the first frame always comes from the run path.
const entryKindFor = (cell: NotebookCell): CellEntryKind | null => {
  if (cell.type === "markdown") return null
  if (cell.mode === "draw") return "chart"
  if (cell.result != null || hasRunMarker(cell)) return "grid"
  return null
}

type EntrySyncKey = Pick<NotebookCell, "id" | "value" | "autoRefresh"> & {
  kind: CellEntryKind
}

const sameEntryCells = (
  previous: EntrySyncKey[],
  eligible: Array<{ cell: NotebookCell; kind: CellEntryKind }>,
): boolean =>
  previous.length === eligible.length &&
  eligible.every(
    ({ cell, kind }, index) =>
      previous[index].id === cell.id &&
      previous[index].value === cell.value &&
      previous[index].autoRefresh === cell.autoRefresh &&
      previous[index].kind === kind,
  )

const slotErrorsSignature = (
  slotErrors: ReadonlyMap<StatementKey, string>,
): string =>
  JSON.stringify(
    [...slotErrors.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  )

const NO_ERRORS_SIG = slotErrorsSignature(new Map())

type Entry = {
  kind: CellEntryKind
  cellId: string
  sql: string
  autoRefresh: AutoRefresh
  visible: boolean
  pendingManualRefresh: boolean
  manualRefreshInFlight: boolean
  // A zero-survivor collapse dropped the display but kept the disk snapshot;
  // the next settle with no result asks hydration for a non-destructive
  // revive, so undo gets its rows back.
  snapshotRetained: boolean
  ensureAttempted: boolean
  lastFetchedAt: number
  state: CellFetchState
  sqlDebounce: ReturnType<typeof setTimeout> | null
  pendingSql: string | null
  inFlight: AbortController | null
  slotAborts: Map<StatementKey, AbortController>
  classifyAbort: AbortController | null
  poll: AbortController | null
  pollKey: string | null
  resultLoadUnsubscribe: (() => void) | null
  lastSnapshotAt: number
  persistedResults: WeakMap<SingleQueryResult[], string>
  lastPersistedErrorsSig: string | null
  lastClearedSqlHash: string | null
  pendingSnapshot: { results: SingleQueryResult[]; durationMs: number } | null
  snapshotTimer: ReturnType<typeof setTimeout> | null
}

export class CellRefreshEngine {
  private entries = new Map<string, Entry>()
  private listeners = new PerKeyListeners()
  private visibilityByCell = new Map<string, boolean>()
  private lastSyncedEntryCells: EntrySyncKey[] | null = null
  private autoRefreshDefault: AutoRefresh | undefined
  private documentHidden = false
  private limitRequest: RequestLimiter
  private initialFetchJitterMs: number
  private batchUpdates: (fn: () => void) => void
  private pendingErrorSeeds = new Map<
    string,
    Array<{ statementKey: string; message: string }>
  >()
  // Runs in flight per cell, from noteRunStarted to noteRunFinished. A count,
  // not a flag: a superseded run's finish must not reopen the gate while its
  // replacement still runs. Keyed outside the entries so a run on a cell whose
  // entry appears mid-run (first run of an editor-only cell) is still covered.
  private pendingRunCounts = new Map<string, number>()

  private refreshHandler = (payload?: { cellId?: string }) => {
    if (payload?.cellId) void this.refresh(payload.cellId)
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
    private getDeps: () => CellRefreshDeps,
    options: CellRefreshEngineOptions = {},
  ) {
    this.limitRequest = options.requestLimiter ?? statementRequestLimiter
    this.initialFetchJitterMs =
      options.initialFetchJitterMs ?? INITIAL_FETCH_JITTER_MS
    this.batchUpdates = options.batchUpdates ?? ((fn) => fn())
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
    this.pendingErrorSeeds.clear()
    this.pendingRunCounts.clear()
    this.lastSyncedEntryCells = null
  }

  sync(cells: NotebookCell[], autoRefreshDefault?: AutoRefresh) {
    const eligible = cells.flatMap((cell) => {
      const kind = entryKindFor(cell)
      return kind === null ? [] : [{ cell, kind }]
    })
    const defaultChanged = autoRefreshDefault !== this.autoRefreshDefault
    this.autoRefreshDefault = autoRefreshDefault
    if (
      !defaultChanged &&
      this.lastSyncedEntryCells &&
      sameEntryCells(this.lastSyncedEntryCells, eligible)
    )
      return
    this.lastSyncedEntryCells = eligible.map(({ cell, kind }) => ({
      id: cell.id,
      value: cell.value,
      autoRefresh: cell.autoRefresh,
      kind,
    }))
    const present = new Set<string>()
    for (const { cell, kind } of eligible) {
      present.add(cell.id)
      const entry = this.entries.get(cell.id)
      if (entry && entry.kind !== kind) {
        this.removeEntry(cell.id, "modeExited")
        this.createEntry(cell, kind)
      } else if (entry) {
        this.updateEntry(entry, cell)
      } else {
        this.createEntry(cell, kind)
      }
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
    for (const cellId of [...this.pendingErrorSeeds.keys()]) {
      if (!cellIds.has(cellId)) this.pendingErrorSeeds.delete(cellId)
    }
    for (const cellId of [...this.pendingRunCounts.keys()]) {
      if (!cellIds.has(cellId)) this.pendingRunCounts.delete(cellId)
    }
  }

  // The cell's refresh button: a deliberate user action, so a pending edit is
  // promoted past its debounce and the frame is persisted immediately rather
  // than waiting out the poll throttle. The manual flag shields the round
  // from the poll loop's ticks until it settles.
  refresh(cellId: string): Promise<void> {
    const entry = this.entries.get(cellId)
    if (!entry) return Promise.resolve()
    this.promotePendingSql(entry)
    entry.manualRefreshInFlight = true
    return this.fetchOnce(entry, true).then(() => undefined)
  }

  // Cancel acts per statement. After the barrier it aborts that slot's
  // execution; before the barrier it drops the execution intent only — the
  // validation still completes, so the barrier settles with every class known
  // and one DDL/DML statement still blocks the cell.
  cancelSlot(cellId: string, statementKey: StatementKey) {
    const entry = this.entries.get(cellId)
    if (!entry || entry.kind !== "grid") return
    const slotAbort = entry.slotAborts.get(statementKey)
    if (slotAbort) {
      slotAbort.abort()
      return
    }
    if (!entry.inFlight) return
    const cancelledSlots = new Set(entry.state.cancelledSlots)
    cancelledSlots.add(statementKey)
    this.setState(entry, { cancelledSlots })
  }

  refreshAll(): { refreshed: number; skippedWrites: number } {
    let refreshed = 0
    let skippedWrites = 0
    for (const entry of this.entries.values()) {
      if (
        entry.kind === "grid" &&
        entry.state.classifyBlock?.kind === "write"
      ) {
        skippedWrites++
        continue
      }
      refreshed++
      if (!entry.visible || this.documentHidden) {
        entry.pendingManualRefresh = true
        continue
      }
      // A repeat click must not abort the fetch the previous click started; a
      // background poll fetch queried pre-click state, so supersede it.
      if (entry.inFlight && entry.manualRefreshInFlight) continue
      this.forceRefresh(entry)
    }
    return { refreshed, skippedWrites }
  }

  private forceRefresh(entry: Entry) {
    if (!entry.visible || this.documentHidden) {
      entry.pendingManualRefresh = true
      return
    }
    entry.pendingManualRefresh = false
    this.promotePendingSql(entry)
    this.abortRound(entry)
    entry.manualRefreshInFlight = true
    if (this.shouldPoll(entry)) {
      entry.lastFetchedAt = 0
      entry.poll?.abort()
      entry.poll = null
      entry.pollKey = null
      this.updatePoll(entry)
    } else {
      void this.fetchOnce(entry, true)
    }
  }

  private promotePendingSql(entry: Entry) {
    if (entry.sqlDebounce) {
      clearTimeout(entry.sqlDebounce)
      entry.sqlDebounce = null
    }
    const sql = entry.pendingSql
    entry.pendingSql = null
    if (sql == null || sql === entry.sql) return
    this.applySqlState(entry, sql)
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
    if (entry.pendingManualRefresh) {
      this.forceRefresh(entry)
      return
    }
    this.ensureData(entry)
  }

  getState(cellId: string): CellFetchState | undefined {
    return this.entries.get(cellId)?.state
  }

  isRefreshing(cellId: string): boolean {
    return this.entries.get(cellId)?.state.fetching ?? false
  }

  // The agent-facing view of every live entry: charts and grids alike report
  // in-flight state and their last refresh failure from the same channel.
  readRefreshState(): ReadonlyMap<string, CellRefreshAgentView> {
    const out = new Map<string, CellRefreshAgentView>()
    for (const entry of this.entries.values()) {
      const firstError = [...entry.state.slotErrors.values()][0]
      out.set(entry.cellId, {
        refreshing: entry.state.fetching,
        ...(firstError !== undefined ? { lastRefreshError: firstError } : {}),
        ...(entry.state.classifyBlock?.kind === "write"
          ? { autoRefreshBlocked: "contains_write" as const }
          : {}),
      })
    }
    return out
  }

  countWriteBlockedGrids(): number {
    let count = 0
    for (const entry of this.entries.values()) {
      if (entry.kind === "grid" && entry.state.classifyBlock?.kind === "write")
        count++
    }
    return count
  }

  subscribe(cellId: string, listener: () => void): () => void {
    return this.listeners.subscribe(cellId, listener)
  }

  // Persisted refresh errors re-enter the channel on hydration, so a reload
  // never hides a failed refresh. Seeds may arrive before the entry exists.
  seedRefreshErrors(
    cellId: string,
    errors: Array<{ statementKey: string; message: string }>,
  ) {
    const entry = this.entries.get(cellId)
    if (!entry) {
      this.pendingErrorSeeds.set(cellId, errors)
      return
    }
    this.applyErrorSeed(entry, errors)
  }

  // A completed run replaces the frame wholesale — every refresh failure it
  // could describe is gone with it, and so is a throttle-blocked refresh
  // frame: flushing that later would overwrite the run's own snapshot with
  // pre-run rows. The run persisted just now, so the throttle window restarts.
  noteCellRan(cellId: string) {
    const entry = this.entries.get(cellId)
    if (!entry) return
    this.dropPendingSnapshot(entry)
    entry.lastSnapshotAt = Date.now()
    // The run's own record replaced the disk copy, and it carries no
    // refreshErrors.
    entry.lastPersistedErrorsSig = NO_ERRORS_SIG
    // The refresh stamps describe rounds the run just superseded: leaving
    // them would show the old refresh time under the run's rows. Cleared, the
    // status line falls back to the frame's own run timestamp.
    if (
      entry.state.slotErrors.size === 0 &&
      entry.state.slotFetchedAt.size === 0
    )
      return
    this.setState(entry, {
      slotErrors: new Map(),
      slotFetchedAt: new Map(),
    })
  }

  // A per-statement rerun replaces one slot and persists the whole frame, so
  // a throttle-blocked pre-rerun frame is stale wholesale; only that
  // statement's refresh failure is. The rerun's own record carries no
  // refreshErrors, so surviving sibling failures must be written back here —
  // otherwise a reload would show them as clean over stale rows.
  noteStatementRan(cellId: string, statementKey: StatementKey) {
    const entry = this.entries.get(cellId)
    if (!entry) return
    this.dropPendingSnapshot(entry)
    entry.lastSnapshotAt = Date.now()
    // The rerun's own record replaced the disk copy, and it carries no
    // refreshErrors.
    entry.lastPersistedErrorsSig = NO_ERRORS_SIG
    this.clearSlotError(entry, statementKey)
    this.clearSlotFetchStamp(entry, statementKey)
    if (entry.state.slotErrors.size > 0) this.persistGridFrame(entry, true)
  }

  // A run start always wins over a refresh: the in-flight round is cancelled,
  // and the pending-run count keeps new rounds out for the run's WHOLE span —
  // the classification barrier included, where isCellRunning is still false.
  noteRunStarted(cellId: string) {
    this.pendingRunCounts.set(
      cellId,
      (this.pendingRunCounts.get(cellId) ?? 0) + 1,
    )
    const entry = this.entries.get(cellId)
    if (!entry) return
    this.abortRound(entry)
    entry.manualRefreshInFlight = false
  }

  // Balances noteRunStarted on EVERY outcome — denied, skipped, superseded,
  // thrown included. A leaked count would not corrupt data; it would silently
  // disable refresh for the cell, so the caller wires this in a finally.
  noteRunFinished(cellId: string) {
    const count = this.pendingRunCounts.get(cellId) ?? 0
    if (count <= 1) this.pendingRunCounts.delete(cellId)
    else this.pendingRunCounts.set(cellId, count - 1)
  }

  private isRunPending(cellId: string): boolean {
    return (this.pendingRunCounts.get(cellId) ?? 0) > 0
  }

  private applyErrorSeed(
    entry: Entry,
    errors: Array<{ statementKey: string; message: string }>,
  ) {
    if (errors.length === 0) return
    const slotKeys = new Set(statementKeysFor(entry.state.queries))
    const slotErrors = new Map(entry.state.slotErrors)
    let changed = false
    for (const { statementKey, message } of errors) {
      if (!slotKeys.has(statementKey)) continue
      slotErrors.set(statementKey, message)
      changed = true
    }
    if (changed) this.setState(entry, { slotErrors })
  }

  private createEntry(cell: NotebookCell, kind: CellEntryKind) {
    const entry: Entry = {
      kind,
      cellId: cell.id,
      sql: cell.value,
      autoRefresh: resolveAutoRefresh(
        cell.autoRefresh,
        this.autoRefreshDefault,
      ),
      state: pendingCellFetchState(cell.value),
      visible: this.visibilityByCell.get(cell.id) ?? false,
      pendingManualRefresh: false,
      manualRefreshInFlight: false,
      snapshotRetained: false,
      ensureAttempted: false,
      lastFetchedAt: 0,
      sqlDebounce: null,
      pendingSql: null,
      inFlight: null,
      slotAborts: new Map(),
      classifyAbort: null,
      poll: null,
      pollKey: null,
      resultLoadUnsubscribe: null,
      lastSnapshotAt: 0,
      persistedResults: new WeakMap(),
      lastPersistedErrorsSig: null,
      lastClearedSqlHash: null,
      pendingSnapshot: null,
      snapshotTimer: null,
    }
    this.entries.set(cell.id, entry)
    const seed = this.pendingErrorSeeds.get(cell.id)
    if (seed) {
      this.pendingErrorSeeds.delete(cell.id)
      this.applyErrorSeed(entry, seed)
    }
    if (kind === "grid") this.ensureClassified(entry)
    if (entry.visible) this.ensureData(entry)
  }

  private updateEntry(entry: Entry, cell: NotebookCell) {
    const autoRefresh = resolveAutoRefresh(
      cell.autoRefresh,
      this.autoRefreshDefault,
    )
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
    this.abortRound(entry)
    entry.classifyAbort?.abort()
    entry.classifyAbort = null
    entry.poll?.abort()
    this.entries.delete(cellId)
    // Subscribers re-derive from the now-missing state and settle on idle, so
    // the toolbar is not stranded spinning after the entry is gone.
    this.notify(cellId)
  }

  // Superseding a round also clears its progress flags: the aborted round's
  // finishRound no-ops (inFlight is nulled here), so nothing else would — a
  // replacement round deferred behind the poll jitter can die with the poll,
  // and `fetching` would stay stuck on for a hidden cell.
  private abortRound(entry: Entry) {
    entry.inFlight?.abort()
    entry.inFlight = null
    for (const abort of entry.slotAborts.values()) abort.abort()
    entry.slotAborts.clear()
    if (entry.state.fetching || entry.state.slotFetching.size > 0) {
      this.setState(entry, { fetching: false, slotFetching: new Set() })
    }
  }

  private applySqlState(entry: Entry, sql: string) {
    this.abortRound(entry)
    entry.manualRefreshInFlight = false
    this.stopResultLoadWait(entry)
    entry.sql = sql
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
    // Refresh errors follow statement content: an edited statement's error
    // clears, an unchanged sibling's survives the edit.
    const slotKeys = new Set(statementKeysFor(queries))
    const slotErrors = new Map(
      [...entry.state.slotErrors].filter(([key]) => slotKeys.has(key)),
    )
    const slotFetchedAt = new Map(
      [...entry.state.slotFetchedAt].filter(([key]) => slotKeys.has(key)),
    )
    this.setState(entry, {
      queries,
      queriesKey,
      fetching: false,
      slotFetching: new Set(),
      cancelledSlots: new Set(),
      slotErrors,
      slotFetchedAt,
      ...(sameQueries ? { settledKey: queriesKey } : {}),
    })
    if (entry.kind === "grid") this.ensureClassified(entry)
  }

  private applySql(entry: Entry, sql: string) {
    this.applySqlState(entry, sql)
    if (entry.kind === "grid") this.reconcileGridResult(entry)
    if (entry.visible) this.ensureData(entry)
    else entry.ensureAttempted = false
  }

  // Editor typing reshapes the visible frame after the debounce: unchanged
  // statements keep their results, edited ones drop, zero survivors collapse
  // the cell. Agent paths reconcile in their transitions; this pass is
  // idempotent on top of them.
  private reconcileGridResult(entry: Entry) {
    const deps = this.getDeps()
    const current = deps.getCellResult(entry.cellId)
    if (current == null) {
      // A previous collapse kept the snapshot on disk. Now that the SQL has
      // settled again, ask hydration for a non-destructive reload: a matching
      // text (undo, retype) gets its rows back, anything else leaves the
      // snapshot exactly as it was.
      if (entry.snapshotRetained) deps.reviveResultLoad(entry.cellId)
      return
    }
    entry.snapshotRetained = false
    const reconciled = reconcileCellResultForValue(current, entry.sql)
    if (reconciled === null) {
      // The debounce fires on transient mid-typing text, so a zero-survivor
      // collapse drops the display only — never the disk snapshot. "missing"
      // blocks an in-session reload; the next load reconciles the snapshot
      // against the completed text and deletes it only then.
      deps.setCellResult(entry.cellId, undefined)
      deps.noteResultMissing(entry.cellId)
      entry.snapshotRetained = true
      return
    }
    const unchanged =
      reconciled.results.length === current.results.length &&
      reconciled.results.every((r, index) => r === current.results[index]) &&
      reconciled.activeStatementKey === current.activeStatementKey
    if (!unchanged) deps.setCellResult(entry.cellId, reconciled)
  }

  // Settle from the data already in cell.result — the just-run grid, the
  // engine's own last frame, or a snapshot the hydration engine restored —
  // instead of re-querying. Waits for an in-flight snapshot load. Chart
  // entries fall back to a live fetch when nothing usable exists for the
  // CURRENT queries; grid entries never bootstrap — their first frame always
  // comes from the run path.
  //
  // Never runs for a cell outside the bands: creation and applySql defer it
  // until the retain band (requestHydrate) or a reveal (resume) asks — the
  // same mount/retain contract run-cell results follow.
  private ensureData(entry: Entry) {
    entry.ensureAttempted = true
    this.stopResultLoadWait(entry)
    const { queries, queriesKey, settledKey, classifyBlock } = entry.state
    if (queries.length === 0) {
      if (entry.kind === "chart" && settledKey !== queriesKey) {
        void this.fetchOnce(entry)
      }
      this.updatePoll(entry)
      return
    }
    if (classifyBlock !== null && settledKey === queriesKey) {
      this.updatePoll(entry)
      return
    }
    if (entry.kind === "grid") {
      this.ensureGridData(entry)
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
      this.deriveChartSlotErrors(entry)
      entry.lastFetchedAt = Math.max(entry.lastFetchedAt, chartResult.timestamp)
      this.updatePoll(entry)
      return
    }
    if (this.waitForResultLoad(entry)) return
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

  private ensureGridData(entry: Entry) {
    const result = this.getDeps().getCellResult(entry.cellId)
    if (result != null) {
      this.setState(entry, { settledKey: entry.state.queriesKey })
      // The frame timestamp never advances on grid ticks (it is the viewport
      // token) — a reveal must not regress the freshness finishRound stamped.
      entry.lastFetchedAt = Math.max(entry.lastFetchedAt, result.timestamp)
      this.updatePoll(entry)
      return
    }
    if (this.waitForResultLoad(entry)) return
    // Nothing to refresh (snapshot missing or gone) — stay idle, never fetch.
    this.updatePoll(entry)
  }

  // Returns true when a snapshot load is now pending; resume re-enters on
  // settle, so scheduling — and a pending refresh click — continues only
  // after hydration finishes.
  private waitForResultLoad(entry: Entry): boolean {
    if (this.getDeps().resultLoadStatus(entry.cellId) === "unrequested") {
      this.getDeps().requestResultLoad(entry.cellId)
    }
    if (this.getDeps().resultLoadStatus(entry.cellId) !== "loading") {
      return false
    }
    entry.resultLoadUnsubscribe = this.getDeps().subscribeResultLoad(
      entry.cellId,
      () => {
        const status = this.getDeps().resultLoadStatus(entry.cellId)
        if (status !== "loaded" && status !== "missing" && status !== "failed")
          return
        this.stopResultLoadWait(entry)
        this.resume(entry)
      },
    )
    this.updatePoll(entry)
    return true
  }

  private stopResultLoadWait(entry: Entry) {
    entry.resultLoadUnsubscribe?.()
    entry.resultLoadUnsubscribe = null
  }

  private shouldAutoRefresh(entry: Entry): boolean {
    return (
      entry.autoRefresh !== false &&
      entry.state.queries.length > 0 &&
      // A write grid is a blocked entry: it carries its classification but
      // never ticks. Charts keep their own gate inside the fetch.
      !(entry.kind === "grid" && entry.state.classifyBlock?.kind === "write")
    )
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
    if (!enabled) {
      // A manual refresh still waiting out the start jitter dies with the
      // poll — hand it back to pending so resume() redeems the click.
      if (entry.manualRefreshInFlight && !entry.inFlight) {
        entry.manualRefreshInFlight = false
        entry.pendingManualRefresh = true
      }
      return
    }
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

  private async fetchOnce(
    entry: Entry,
    manual: boolean = false,
  ): Promise<number | void> {
    // A poll tick must not abort the round a refresh click started — skip it;
    // the loop resumes on its own schedule once the manual round settles.
    if (!manual && entry.inFlight && entry.manualRefreshInFlight) return
    // Supersede any in-flight round up front, so a slow earlier response can't
    // land after the query changed — including when it's cleared to empty.
    this.abortRound(entry)
    this.stopResultLoadWait(entry)
    const { queries, queriesKey } = entry.state
    if (queries.length === 0) {
      entry.manualRefreshInFlight = false
      this.setState(entry, {
        fetching: false,
        settledKey: queriesKey,
        classifyBlock: null,
        slotFetching: new Set(),
        slotErrors: new Map(),
        cancelledSlots: new Set(),
      })
      if (entry.kind === "chart") this.clearCellData(entry)
      return
    }
    // A manual run always wins: a tick never races the run path's frame.
    // isRunPending covers the classification barrier and the one-frame lag
    // before runningCellIds reaches the deps closure; isCellRunning stays as
    // the backstop for a run the provider never announced.
    if (
      entry.kind === "grid" &&
      (this.isRunPending(entry.cellId) ||
        this.getDeps().isCellRunning(entry.cellId))
    ) {
      entry.manualRefreshInFlight = false
      return
    }
    // A grid refresh re-runs an existing frame; with nothing on screen there
    // is nothing to refresh — the first frame always comes from the run path.
    if (
      entry.kind === "grid" &&
      this.getDeps().getCellResult(entry.cellId) == null
    ) {
      // A refresh click can land before a released snapshot hydrates — hand
      // the intent back to pending and redeem it when the load settles.
      if (
        (manual || entry.manualRefreshInFlight) &&
        this.waitForResultLoad(entry)
      ) {
        entry.manualRefreshInFlight = false
        entry.pendingManualRefresh = true
        return
      }
      entry.manualRefreshInFlight = false
      this.setState(entry, { settledKey: queriesKey })
      return
    }
    const ac = new AbortController()
    entry.inFlight = ac
    this.setState(entry, { fetching: true, cancelledSlots: new Set() })
    const start = performance.now()
    // A refresh-all click on a polling cell redeems itself through the poll
    // loop's first tick, so the manual intent rides on the entry, not the call.
    const userAsked = manual || entry.manualRefreshInFlight
    if (entry.kind === "grid") await this.runGridRound(entry, ac, userAsked)
    else await this.runChartFetch(entry, ac)
    return performance.now() - start
  }

  // One classification per launch: the barrier result is the single decision
  // for the write gate and slot exclusion. Validation requests are ROUND-owned
  // (a slot cancel never aborts them — the barrier needs every class);
  // execution requests are SLOT-owned.
  private classifyForRound(
    entry: Entry,
    round: AbortController,
  ): Promise<ClassifiedStatement[]> {
    return classifyStatements(entry.sql, (sql) =>
      this.limitRequest(
        () => this.getDeps().validateWithGlobals(sql, round.signal),
        round.signal,
      ),
    )
  }

  private async runChartFetch(entry: Entry, ac: AbortController) {
    const deps = this.getDeps()
    const { queries, queriesKey } = entry.state
    try {
      // Runtime backstop: a user typing DDL into an already-draw cell would
      // otherwise reach executeSingle on the next poll tick. A query failing
      // validation is never executed — re-validating it every tick means an
      // INSERT whose missing table appears later classifies as a write and
      // gets blocked, instead of silently running.
      let classified: ClassifiedStatement[]
      try {
        classified = await this.classifyForRound(entry, ac)
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
      const offender = classified.find((s) => s.klass === "DDL_DML")
      if (offender) {
        this.setState(entry, {
          classifyBlock: {
            kind: "write",
            queryType: offender.queryType ?? "write",
          },
          classifiedKey: queriesKey,
          settledKey: queriesKey,
        })
        // The cell now holds a write — drop any stale rows the grid would show.
        this.clearCellData(entry)
        return
      }
      this.setState(entry, { classifyBlock: null, classifiedKey: queriesKey })
      const fetchStartedAt = Date.now()
      const out = await Promise.all(
        queries.map((q, index) => {
          const stmt = classified[index]
          if (stmt?.klass === "ERROR")
            return Promise.resolve(
              errorExecResult(q, stmt.error ?? "Invalid statement"),
            )
          return this.limitRequest(
            () => deps.executeSingle(q, ac.signal, NOTEBOOK_ROW_CAP),
            ac.signal,
          ).catch((e) => errorExecResult(q, e))
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
        this.deriveChartSlotErrors(entry)
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
      this.deriveChartSlotErrors(entry)
      if (successResults(out).length > 0) {
        this.queueSnapshot(entry, written, fetchDurationMs)
      } else {
        this.clearSnapshot(entry)
      }
    } finally {
      this.finishRound(entry, ac)
    }
  }

  // The refresh unit is the statement: each slot swaps or fails alone while
  // its old rows stay visible. An invalid statement is excluded with its
  // validation error; one DDL/DML class blocks the whole cell (the engine
  // never runs writes); a validate transport failure skips the round.
  private async runGridRound(
    entry: Entry,
    round: AbortController,
    manual: boolean,
  ) {
    const deps = this.getDeps()
    const { queries, queriesKey } = entry.state
    try {
      let classified: ClassifiedStatement[]
      try {
        classified = await this.classifyForRound(entry, round)
      } catch (e) {
        if (round.signal.aborted) return
        const message = e instanceof Error ? e.message : "validate failed"
        this.setState(entry, {
          classifyBlock: { kind: "failed", message },
          settledKey: queriesKey,
        })
        return
      }
      if (round.signal.aborted) return
      const offender = classified.find((s) => s.klass === "DDL_DML")
      if (offender) {
        // A write cell is a blocked entry: no execution, old rows stay.
        this.setState(entry, {
          classifyBlock: {
            kind: "write",
            queryType: offender.queryType ?? "write",
          },
          classifiedKey: queriesKey,
          settledKey: queriesKey,
        })
        this.updatePoll(entry)
        return
      }
      const slotKeys = statementKeysFor(queries)
      const invalidSlots: Array<{ key: StatementKey; message: string }> = []
      const launchSlots: Array<{ key: StatementKey; index: number }> = []
      slotKeys.forEach((key, index) => {
        if (entry.state.cancelledSlots.has(key)) return
        const stmt = classified[index]
        if (stmt?.klass === "ERROR") {
          invalidSlots.push({ key, message: stmt.error ?? "Invalid statement" })
        } else {
          launchSlots.push({ key, index })
        }
      })
      const launchPatch: Partial<CellFetchState> = {
        classifyBlock: null,
        classifiedKey: queriesKey,
      }
      if (invalidSlots.length > 0) {
        const slotErrors = new Map(entry.state.slotErrors)
        invalidSlots.forEach(({ key, message }) =>
          slotErrors.set(key, message.trim()),
        )
        launchPatch.slotErrors = slotErrors
      }
      if (launchSlots.length > 0) {
        const slotFetching = new Set(entry.state.slotFetching)
        launchSlots.forEach(({ key }) => slotFetching.add(key))
        launchPatch.slotFetching = slotFetching
      }
      this.setState(entry, launchPatch)
      await Promise.all(
        launchSlots.map(async ({ key, index }) => {
          if (round.signal.aborted) return
          const slotAbort = new AbortController()
          entry.slotAborts.set(key, slotAbort)
          try {
            const exec = await this.limitRequest(
              () =>
                deps.executeSingle(
                  queries[index],
                  slotAbort.signal,
                  NOTEBOOK_ROW_CAP,
                ),
              slotAbort.signal,
            )
            if (slotAbort.signal.aborted || round.signal.aborted) return
            this.batchUpdates(() => {
              if (exec.type === "error") {
                this.setSlotError(entry, key, exec.error ?? "Query failed")
              } else {
                // The fetch time always advances — the status line shows the
                // poll that just verified the rows. The frame is rewritten only
                // when the rows changed, so an identical poll costs no renders
                // and no snapshot churn.
                const previous = this.currentSlotResult(entry.cellId, key)
                const unchanged =
                  previous !== undefined &&
                  resultsEquivalent([toExecResult(previous)], [exec])
                if (!unchanged) this.commitSlotResult(entry, key, exec)
                this.settleSlotSuccess(entry, key)
              }
            })
          } catch (e) {
            if (slotAbort.signal.aborted || round.signal.aborted) return
            this.batchUpdates(() =>
              this.setSlotError(entry, key, errorMessage(e)),
            )
          } finally {
            // A superseded round's late settle must not clobber the slot the
            // replacement round registered under the same key.
            if (entry.slotAborts.get(key) === slotAbort) {
              entry.slotAborts.delete(key)
              if (entry.state.slotFetching.has(key))
                this.batchUpdates(() => this.setSlotFetching(entry, key, false))
            }
          }
        }),
      )
      if (round.signal.aborted) return
      this.setState(entry, { settledKey: queriesKey })
      this.persistGridFrame(entry, manual)
    } finally {
      this.finishRound(entry, round)
    }
  }

  private finishRound(entry: Entry, ac: AbortController) {
    // Only clear when still the active round — a superseded (aborted) one
    // must not flip `fetching` off while its replacement is in flight.
    if (entry.inFlight === ac) {
      entry.inFlight = null
      entry.manualRefreshInFlight = false
      entry.lastFetchedAt = Date.now()
      this.setState(entry, { fetching: false, slotFetching: new Set() })
    }
  }

  private currentSlotResult(
    cellId: string,
    key: StatementKey,
  ): SingleQueryResult | undefined {
    const current = this.getDeps().getCellResult(cellId)
    if (!current) return undefined
    const keys = statementKeysFor(current.results.map((r) => r.query))
    const index = keys.indexOf(key)
    return index === -1 ? undefined : current.results[index]
  }

  // A settled slot swaps its rows into the visible frame in statement order.
  // A statement without a previous result (added since the last run) lands
  // like any other; the active tab follows its statement's content.
  private commitSlotResult(
    entry: Entry,
    key: StatementKey,
    exec: QueryExecResult,
  ) {
    const deps = this.getDeps()
    const current = deps.getCellResult(entry.cellId)
    if (!current) return
    const slotKeys = statementKeysFor(entry.state.queries)
    const slotIndex = slotKeys.indexOf(key)
    if (slotIndex === -1) return
    const currentKeys = statementKeysFor(current.results.map((r) => r.query))
    const byKey = new Map<StatementKey, SingleQueryResult>()
    currentKeys.forEach((currentKey, index) => {
      byKey.set(currentKey, current.results[index])
    })
    byKey.set(key, singleResultFromExec(exec, entry.state.queries[slotIndex]))
    const nextKeys = slotKeys.filter((slotKey) => byKey.has(slotKey))
    const nextResults = nextKeys.map(
      (slotKey) => byKey.get(slotKey) as SingleQueryResult,
    )
    const activeKey =
      current.activeStatementKey ??
      currentKeys[
        Math.min(Math.max(current.activeResultIndex, 0), currentKeys.length - 1)
      ]
    // The frame timestamp is the grid's viewport token for every tab:
    // bumping it per slot settle would reset scroll and focus. A settled
    // slot's freshness advances through slotFetchedAt instead.
    deps.setCellResult(entry.cellId, {
      ...current,
      results: nextResults,
      activeResultIndex: Math.max(0, nextKeys.indexOf(activeKey)),
      ...(activeKey !== undefined ? { activeStatementKey: activeKey } : {}),
    })
  }

  // The snapshot write unit is always the WHOLE visible frame — never an
  // error alone.
  //
  // Every settled round queues a write through the 10s throttle — an
  // unchanged frame still re-persists once per window, so a reload's savedAt
  // stays current instead of showing minutes-old data under a live poller.
  // The throttle is bypassed only when the error set CHANGED (first failure,
  // new message, recovery) — that state must survive an immediate reload —
  // and when the user asked by hand. A repeating failure follows the
  // throttle like any healthy tick; losing a throttled tick is
  // self-correcting — the next one regenerates it. The pagehide flush is a
  // best-effort backstop, not a guarantee: an IndexedDB write started during
  // teardown is routinely dropped, so nothing durable may depend on it.
  private persistGridFrame(entry: Entry, manual: boolean) {
    const current = this.getDeps().getCellResult(entry.cellId)
    if (!current || current.results.length === 0) return
    const errorsSig = slotErrorsSignature(entry.state.slotErrors)
    if (manual || errorsSig !== entry.lastPersistedErrorsSig)
      entry.lastSnapshotAt = 0
    this.queueSnapshot(entry, current.results, 0)
  }

  private setSlotError(entry: Entry, key: StatementKey, message: string) {
    const slotErrors = new Map(entry.state.slotErrors)
    slotErrors.set(key, message.trim())
    this.setState(entry, { slotErrors })
  }

  private clearSlotError(entry: Entry, key: StatementKey) {
    if (!entry.state.slotErrors.has(key)) return
    const slotErrors = new Map(entry.state.slotErrors)
    slotErrors.delete(key)
    this.setState(entry, { slotErrors })
  }

  private clearSlotFetchStamp(entry: Entry, key: StatementKey) {
    if (!entry.state.slotFetchedAt.has(key)) return
    const slotFetchedAt = new Map(entry.state.slotFetchedAt)
    slotFetchedAt.delete(key)
    this.setState(entry, { slotFetchedAt })
  }

  // A settle is one patch — stamp, error clear and fetching flip land in a
  // single notify, so a round of S slots costs S renders, not 3S.
  private settleSlotSuccess(entry: Entry, key: StatementKey) {
    const slotFetchedAt = new Map(entry.state.slotFetchedAt)
    slotFetchedAt.set(key, Date.now())
    const slotFetching = new Set(entry.state.slotFetching)
    slotFetching.delete(key)
    const patch: Partial<CellFetchState> = { slotFetchedAt, slotFetching }
    if (entry.state.slotErrors.has(key)) {
      const slotErrors = new Map(entry.state.slotErrors)
      slotErrors.delete(key)
      patch.slotErrors = slotErrors
    }
    this.setState(entry, patch)
  }

  private setSlotFetching(entry: Entry, key: StatementKey, fetching: boolean) {
    const slotFetching = new Set(entry.state.slotFetching)
    if (fetching) slotFetching.add(key)
    else slotFetching.delete(key)
    this.setState(entry, { slotFetching })
  }

  // Chart refresh failures live inside the settled frame (error results); the
  // channel re-derives from it so both views feed one last_refresh_error
  // surface — including after a reload.
  private deriveChartSlotErrors(entry: Entry) {
    const current = this.getDeps().getCellResult(entry.cellId)
    const slotErrors = new Map<StatementKey, string>()
    if (current) {
      const keys = statementKeysFor(current.results.map((r) => r.query))
      current.results.forEach((result, index) => {
        if (result.type === "error") slotErrors.set(keys[index], result.error)
      })
    }
    const previous = entry.state.slotErrors
    const same =
      previous.size === slotErrors.size &&
      [...slotErrors].every(([key, value]) => previous.get(key) === value)
    if (!same) this.setState(entry, { slotErrors })
  }

  // Classification has its own lifecycle, independent of polling: entry
  // creation, hydration completion, and the debounced SQL change all classify
  // — so an Off write grid still carries its block for the disabled selector
  // and auto_refresh_blocked. The shared text cache absorbs the mount burst.
  private ensureClassified(entry: Entry) {
    entry.classifyAbort?.abort()
    if (entry.state.queries.length === 0) {
      entry.classifyAbort = null
      return
    }
    const ac = new AbortController()
    entry.classifyAbort = ac
    const classifiedKey = entry.state.queriesKey
    void classifyStatements(entry.sql, (sql) =>
      this.limitRequest(
        () => this.getDeps().validateWithGlobals(sql, ac.signal),
        ac.signal,
      ),
    ).then(
      (classified) => {
        if (ac.signal.aborted || entry.classifyAbort !== ac) return
        entry.classifyAbort = null
        if (this.entries.get(entry.cellId) !== entry) return
        const offender = classified.find((s) => s.klass === "DDL_DML")
        this.setState(entry, {
          classifiedKey,
          classifyBlock: offender
            ? { kind: "write", queryType: offender.queryType ?? "write" }
            : null,
        })
        this.updatePoll(entry)
      },
      () => {
        // Transport failure: keep the last known class; the next tick, edit,
        // or hydration retries.
        if (entry.classifyAbort === ac) entry.classifyAbort = null
      },
    )
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
    const persistedErrorsSig = slotErrorsSignature(entry.state.slotErrors)
    const current = this.getDeps().getCellResult(entry.cellId)
    const failedCount = results.filter((r) => r.type === "error").length
    const script =
      entry.kind === "grid"
        ? current?.script
        : results.length > 1
          ? {
              successCount: results.length - failedCount,
              failedCount,
              durationMs,
            }
          : undefined
    // Grid refresh errors persist with the frame so a failed refresh is never
    // hidden behind a reload; charts re-derive theirs from the frame itself.
    const refreshErrors =
      entry.kind === "grid" && entry.state.slotErrors.size > 0
        ? [...entry.state.slotErrors].map(([statementKey, message]) => ({
            statementKey,
            message,
          }))
        : undefined
    return persistCellSnapshot({
      bufferId: this.bufferId,
      cellId: entry.cellId,
      results,
      savedAt: Date.now(),
      activeResultIndex: current?.activeResultIndex ?? 0,
      ...(current?.activeStatementKey !== undefined
        ? { activeStatementKey: current.activeStatementKey }
        : {}),
      ...(script ? { script } : {}),
      ...(refreshErrors ? { refreshErrors } : {}),
    }).then((saved) => {
      if (!saved) return
      entry.persistedResults.set(results, persistedSqlHash)
      entry.lastPersistedErrorsSig = persistedErrorsSig
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

  private setState(entry: Entry, patch: Partial<CellFetchState>) {
    entry.state = { ...entry.state, ...patch }
    this.notify(entry.cellId)
  }

  private notify(cellId: string) {
    this.listeners.notify(cellId)
  }
}
