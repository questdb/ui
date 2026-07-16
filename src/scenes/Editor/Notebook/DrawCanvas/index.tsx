import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import styled from "styled-components"
import type { NotebookCell } from "../../../../store/notebook"
import type { ChartConfig } from "../CellChart/chartTypes"
import { buildEchartsOption } from "../CellChart/buildEchartsOption"
import {
  ChartRenderer,
  type ChartRendererHandle,
} from "../CellChart/ChartRenderer"
import { ChartSettingsDrawer } from "../CellChart/ChartSettingsDrawer"
import { useAdaptivePoll } from "../../../../hooks/useAdaptivePoll"
import { useQueryExecution } from "../../../../hooks/useQueryExecution"
import type { QueryExecResult } from "../../../../hooks/useQueryExecution"
import { getQueriesFromText } from "../../Monaco/utils"
import {
  resolveDraw,
  resultMatchesQueries,
  resultsEquivalent,
  successResults,
  toExecResult,
} from "./drawCanvasUtils"
import { useNotebookActions } from "../NotebookProvider"
import { useValidateWithGlobals } from "../globals/useValidateWithGlobals"
import { toast } from "../../../../components/Toast"
import { CircleNotchSpinner } from "../../Monaco/icons"
import {
  autoRefreshIntervalMs,
  capResultBytes,
  NOTEBOOK_BYTE_CAP,
  NOTEBOOK_ROW_CAP,
  singleResultFromExec,
  sqlHash,
} from "../notebookUtils"
import {
  deleteCellSnapshot,
  loadCellSnapshot,
} from "../../../../store/notebookResults"
import { persistCellSnapshot } from "../persistCellSnapshot"
import { eventBus } from "../../../../modules/EventBus"
import { EventType } from "../../../../modules/EventBus/types"

const REFRESH_MIN_MS = 2000
const REFRESH_MAX_MS = 60000
const FETCH_DEBOUNCE_MS = 300

const errorExecResult = (query: string): QueryExecResult => ({
  type: "error",
  query,
  columns: [],
  dataset: [],
  count: 0,
  error: "Query failed",
})
// Draw auto-refresh can poll every few seconds; throttle snapshot writes so a
// live chart doesn't churn IndexedDB. A reload restores the last saved frame.
const SNAPSHOT_THROTTLE_MS = 10000

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  position: relative;
  background: ${({ theme }) => theme.color.backgroundLighter};
`

const Canvas = styled.div`
  flex: 1;
  min-height: 0;
  position: relative;
`

const EmptyState = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${({ theme }) => theme.color.gray2};
  font-size: ${({ theme }) => theme.fontSize.sm};
`

type Props = {
  cell: NotebookCell
  bufferId?: number
  isFocused: boolean
  onConfigChange: (config: ChartConfig) => void
}

export const DrawCanvas: React.FC<Props> = ({
  cell,
  bufferId,
  isFocused,
  onConfigChange,
}) => {
  const { getVariables, mirrorCellResult } = useNotebookActions()
  const { executeSingle } = useQueryExecution(getVariables())
  const validateWithGlobals = useValidateWithGlobals()
  const [results, setResults] = useState<QueryExecResult[]>([])
  const [fetching, setFetching] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settledKey, setSettledKey] = useState<string | null>(null)
  const [lastFetchHadError, setLastFetchHadError] = useState(false)
  const [classifyBlock, setClassifyBlock] = useState<
    | { kind: "write"; queryType: string }
    | { kind: "failed"; message: string }
    | null
  >(null)
  const [zoomStart, setZoomStart] = useState(0)
  const [zoomEnd, setZoomEnd] = useState(100)
  const [debouncedSql, setDebouncedSql] = useState(cell.value)
  useEffect(() => {
    const timer = setTimeout(
      () => setDebouncedSql(cell.value),
      FETCH_DEBOUNCE_MS,
    )
    return () => clearTimeout(timer)
  }, [cell.value])

  const classifyCache = useMemo(
    () => new Map<string, "DQL" | "DDL_DML" | "ERROR">(),
    [debouncedSql],
  )

  const configAtSettingsOpenRef = useRef<ChartConfig | undefined>(undefined)
  const chartRendererRef = useRef<ChartRendererHandle | null>(null)
  const isZoomed = zoomStart > 0 || zoomEnd < 100

  const handleZoomChange = useCallback((start: number, end: number) => {
    setZoomStart(start)
    setZoomEnd(end)
  }, [])

  const handleResetZoom = useCallback(() => {
    chartRendererRef.current?.resetZoom()
    setZoomStart(0)
    setZoomEnd(100)
  }, [])

  const queries = useMemo(
    () => getQueriesFromText(debouncedSql),
    [debouncedSql],
  )
  const queriesKey = queries.join("\u0001")

  const inFlightRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(true)
  const lastSnapshotAtRef = useRef(0)
  // Latest cell.result, read at mount to transfer existing data into the chart
  // without re-querying when toggling over from the grid.
  const cellResultRef = useRef(cell.result)
  // Last results mirrored into cell.result, so the grid shows the chart's
  // current data on switch-back; guards against redundant cell writes.
  const lastMirrorRef = useRef<QueryExecResult[]>([])
  // Set when we transfer existing data in on mount, so the poll skips its
  // otherwise-immediate first fetch (the data is already current).
  const skipNextPollFetchRef = useRef(false)
  const getSkipInitialFetch = useCallback(() => {
    const skip = skipNextPollFetchRef.current
    skipNextPollFetchRef.current = false
    return skip
  }, [])
  // Whether the poll is driving the fetch. The mount effect's fallback reads it
  // (live, via a ref) so it only fetches when polling is off — otherwise the
  // poll's immediate first tick is the single fetch, not a duplicate.
  const pollEnabledRef = useRef(false)
  const lastSavedRef = useRef<{
    sqlHash: string
    results: QueryExecResult[]
  } | null>(null)

  // Persist a bounded, throttled copy of the chart's rows — shared with run
  // mode (one snapshot per cell) so the chart survives reload without re-fetch.
  // Frames identical to the last saved one are skipped; a changed frame blocked
  // by the throttle retries on the next poll tick, so the final frame persists.
  const saveDrawSnapshot = useCallback(
    (execResults: QueryExecResult[]) => {
      if (bufferId === undefined) return
      const currentSqlHash = sqlHash(debouncedSql)
      const last = lastSavedRef.current
      if (
        last &&
        last.sqlHash === currentSqlHash &&
        resultsEquivalent(last.results, execResults)
      )
        return
      const now = Date.now()
      if (now - lastSnapshotAtRef.current < SNAPSHOT_THROTTLE_MS) return
      lastSnapshotAtRef.current = now
      lastSavedRef.current = { sqlHash: currentSqlHash, results: execResults }
      const results = execResults.map((r) =>
        capResultBytes(singleResultFromExec(r, r.query), NOTEBOOK_BYTE_CAP),
      )
      void persistCellSnapshot({
        bufferId,
        cellId: cell.id,
        results,
        savedAt: now,
      })
    },
    [bufferId, cell.id, debouncedSql],
  )

  const clearDrawSnapshot = useCallback(() => {
    if (bufferId === undefined) return
    const currentSqlHash = sqlHash(debouncedSql)
    const last = lastSavedRef.current
    if (last && last.sqlHash === currentSqlHash && last.results.length === 0)
      return
    lastSavedRef.current = { sqlHash: currentSqlHash, results: [] }
    void deleteCellSnapshot(bufferId, cell.id)
  }, [bufferId, cell.id, debouncedSql])

  const mirrorToCellResult = useCallback(
    (next: QueryExecResult[]) => {
      if (resultsEquivalent(lastMirrorRef.current, next)) return
      lastMirrorRef.current = next
      mirrorCellResult(
        cell.id,
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
    },
    [mirrorCellResult, cell.id],
  )

  const fetchAll = useCallback(async () => {
    // Supersede any in-flight fetch up front, so a slow earlier response can't
    // land after the query changed — including when it's cleared to empty.
    inFlightRef.current?.abort()
    inFlightRef.current = null
    if (queries.length === 0) {
      setResults((prev) => (prev.length === 0 ? prev : []))
      setFetching(false)
      setSettledKey(queriesKey)
      setLastFetchHadError(false)
      setClassifyBlock(null)
      // No query → drop the grid mirror and the saved frame too.
      mirrorToCellResult([])
      clearDrawSnapshot()
      return
    }
    const ac = new AbortController()
    inFlightRef.current = ac
    setFetching(true)
    try {
      // Runtime backstop: a user typing DDL into an already-draw cell would
      // otherwise reach executeSingle on the next poll tick.
      try {
        await Promise.all(
          queries.map(async (q) => {
            if (classifyCache.has(q)) return
            const res = await validateWithGlobals(q, ac.signal)
            if ("error" in res) classifyCache.set(q, "ERROR")
            else if ("columns" in res) classifyCache.set(q, "DQL")
            else classifyCache.set(q, "DDL_DML")
          }),
        )
      } catch (e) {
        if (ac.signal.aborted) return
        const message = e instanceof Error ? e.message : "validate failed"
        setClassifyBlock({ kind: "failed", message })
        setSettledKey(queriesKey)
        return
      }
      if (ac.signal.aborted) return
      const offender = queries
        .map((q) => ({ q, klass: classifyCache.get(q) }))
        .find((x) => x.klass === "DDL_DML")
      if (offender) {
        const validateResult = await validateWithGlobals(
          offender.q,
          ac.signal,
        ).catch(() => null)
        if (ac.signal.aborted) return
        const queryType =
          validateResult && "queryType" in validateResult
            ? validateResult.queryType
            : "write"
        setClassifyBlock({ kind: "write", queryType })
        setResults((prev) => (prev.length === 0 ? prev : []))
        setLastFetchHadError(false)
        setSettledKey(queriesKey)
        // The cell now holds a write — drop any stale rows the grid would show.
        mirrorToCellResult([])
        return
      }
      setClassifyBlock(null)
      const out = await Promise.all(
        queries.map((q) =>
          executeSingle(q, ac.signal, NOTEBOOK_ROW_CAP).catch(() => null),
        ),
      )
      if (ac.signal.aborted) return
      const next = successResults(out)
      setResults((prev) => (resultsEquivalent(prev, next) ? prev : next))
      setLastFetchHadError(out.some((r) => r === null))
      setSettledKey(queriesKey)
      if (next.length > 0) saveDrawSnapshot(next)
      else clearDrawSnapshot()
      // Mirror EVERY statement (not just chartable ones) so a switch to the grid
      // shows the same tabs a real run would — including errors and empty
      // results — instead of dropping them or leaving stale rows behind.
      mirrorToCellResult(out.map((r, i) => r ?? errorExecResult(queries[i])))
    } finally {
      // Only clear when still the active fetch — a superseded (aborted) run
      // must not flip `fetching` off while its replacement is in flight.
      if (inFlightRef.current === ac) {
        inFlightRef.current = null
        if (mountedRef.current) setFetching(false)
      }
    }
  }, [
    classifyCache,
    executeSingle,
    validateWithGlobals,
    queries,
    queriesKey,
    saveDrawSnapshot,
    clearDrawSnapshot,
    mirrorToCellResult,
  ])

  useEffect(() => {
    cellResultRef.current = cell.result
  }, [cell.result])

  // On mount, render instantly from existing data instead of re-querying:
  //   1. cell.result — the just-run grid, or the chart's own mirrored frame.
  //      Transfers the data when toggling grid↔chart (no spinner, no re-run).
  //   2. the persisted snapshot — survives reload (cell.result is stripped).
  // autoRefresh-off cells then stay on that frame; autoRefresh-on cells let the
  // poll refresh in the background. Falls back to a live fetch when neither has
  // chartable rows.
  useEffect(() => {
    const existing = cellResultRef.current
    // Transfer only a result produced by the CURRENT queries — a result left
    // over from edited-but-not-rerun SQL is stale and must be re-fetched.
    const transferred = resultMatchesQueries(existing, queries)
      ? successResults(existing.results.map(toExecResult))
      : []
    if (transferred.length > 0) {
      setResults((prev) => (prev.length > 0 ? prev : transferred))
      setSettledKey(queriesKey)
      skipNextPollFetchRef.current = true
      return
    }
    let cancelled = false
    void (async () => {
      if (bufferId !== undefined) {
        // Best-effort: a failed read falls through to a live fetch instead of
        // leaving the chart on its loading spinner forever.
        const snap = await loadCellSnapshot(bufferId, cell.id).catch(
          () => undefined,
        )
        if (cancelled) return
        // Only render a snapshot produced by the CURRENT queries — one left
        // over from edited-but-not-rerun SQL is stale and must re-fetch (the
        // snapshot is keyed by cell, not SQL, so it can outlive an edit).
        const snapResult = snap && {
          results: snap.results,
          activeResultIndex: 0,
          timestamp: snap.savedAt,
        }
        if (resultMatchesQueries(snapResult, queries)) {
          const hydrated = successResults(snapResult.results.map(toExecResult))
          if (hydrated.length > 0) {
            // Don't clobber live data that may already have landed.
            setResults((prev) => (prev.length > 0 ? prev : hydrated))
            setSettledKey(queriesKey)
            // Seed cell.result too, so a switch to the grid shows this frame
            // instead of an empty cell (cell.result is stripped on reload).
            mirrorToCellResult(hydrated)
            return
          }
        }
      }
      if (!cancelled && !pollEnabledRef.current) void fetchAll()
    })()
    return () => {
      cancelled = true
    }
  }, [fetchAll, bufferId, cell.id, queriesKey, queries, mirrorToCellResult])

  useEffect(
    () => () => {
      mountedRef.current = false
      inFlightRef.current?.abort()
    },
    [],
  )

  const autoRefresh = cell.autoRefresh ?? true
  const fixedIntervalMs = autoRefreshIntervalMs(autoRefresh)
  const pollEnabled = autoRefresh !== false && queries.length > 0

  useEffect(() => {
    pollEnabledRef.current = pollEnabled
  }, [pollEnabled])

  useAdaptivePoll({
    fetchFn: fetchAll,
    enabled: pollEnabled,
    key: `${cell.id}:${queriesKey}:${autoRefresh}`,
    minIntervalMs: fixedIntervalMs ?? REFRESH_MIN_MS,
    maxIntervalMs: fixedIntervalMs ?? REFRESH_MAX_MS,
    getSkipInitialFetch,
  })

  const resolution = useMemo(
    () => resolveDraw(queries, results, cell.chartConfig),
    [queries, results, cell.chartConfig],
  )

  const openSettings = useCallback(() => {
    configAtSettingsOpenRef.current = cell.chartConfig
    setSettingsOpen(true)
  }, [cell.chartConfig])

  const option = useMemo(
    () => buildEchartsOption(resolution.chart, resolution.renderQueries),
    [resolution],
  )

  const empty =
    classifyBlock !== null || queries.length === 0 || results.length === 0
  const settledForCurrentQueries = settledKey === queriesKey
  // Initial load (snapshot hydration or first fetch) with nothing to show yet:
  // a spinner replaces the chart area until data lands.
  const loading =
    queries.length > 0 &&
    classifyBlock === null &&
    !settledForCurrentQueries &&
    results.length === 0
  let emptyMessage: string
  if (classifyBlock?.kind === "write") {
    emptyMessage = `Cannot draw a write query ('${classifyBlock.queryType}'). Switch to Run mode to execute this SQL.`
  } else if (classifyBlock?.kind === "failed") {
    emptyMessage = `Cannot classify cell SQL (${classifyBlock.message}). Refusing to draw until the query can be classified safely.`
  } else if (queries.length === 0) {
    emptyMessage = "Type a query to draw."
  } else if (!settledForCurrentQueries) {
    emptyMessage = "Drawing\u2026"
  } else if (lastFetchHadError) {
    emptyMessage = "Query failed — check the SQL editor for the error."
  } else {
    emptyMessage = "No data to plot."
  }

  useEffect(() => {
    if (!settingsOpen) return
    if (cell.chartConfig !== configAtSettingsOpenRef.current) {
      setSettingsOpen(false)
      toast.info(
        "Chart settings were updated by the assistant. Reopen chart configuration to edit.",
      )
    }
  }, [cell.chartConfig, settingsOpen])

  useEffect(() => {
    const forThisCell =
      (run: () => void) => (payload?: { cellId?: string }) => {
        if (payload?.cellId === cell.id) run()
      }
    const refresh = forThisCell(() => void fetchAll())
    const open = forThisCell(openSettings)
    const reset = forThisCell(handleResetZoom)
    eventBus.subscribe(EventType.NOTEBOOK_CELL_REFRESH_CHART, refresh)
    eventBus.subscribe(EventType.NOTEBOOK_CELL_OPEN_CHART_SETTINGS, open)
    eventBus.subscribe(EventType.NOTEBOOK_CELL_RESET_ZOOM, reset)
    return () => {
      eventBus.unsubscribe(EventType.NOTEBOOK_CELL_REFRESH_CHART, refresh)
      eventBus.unsubscribe(EventType.NOTEBOOK_CELL_OPEN_CHART_SETTINGS, open)
      eventBus.unsubscribe(EventType.NOTEBOOK_CELL_RESET_ZOOM, reset)
    }
  }, [cell.id, fetchAll, openSettings, handleResetZoom])

  useEffect(() => {
    eventBus.publish(EventType.NOTEBOOK_CELL_CHART_ZOOM, {
      cellId: cell.id,
      zoomed: isZoomed,
    })
  }, [cell.id, isZoomed])

  // Surface fetch state to the cell toolbar. `loading` is the first-time draw
  // (no data yet) — the view toggle spins for it. `refreshing` is a re-fetch
  // over existing data (auto-poll or manual refresh) — the refresh button spins
  // for it. Publish both false on unmount so no control is stranded spinning.
  const refreshing = fetching && !loading
  useEffect(() => {
    eventBus.publish(EventType.NOTEBOOK_CELL_CHART_LOADING, {
      cellId: cell.id,
      loading,
      refreshing,
    })
  }, [cell.id, loading, refreshing])
  useEffect(
    () => () => {
      eventBus.publish(EventType.NOTEBOOK_CELL_CHART_LOADING, {
        cellId: cell.id,
        loading: false,
        refreshing: false,
      })
    },
    [cell.id],
  )

  return (
    <Wrapper>
      {loading ? (
        <EmptyState>
          <CircleNotchSpinner size={24} />
        </EmptyState>
      ) : empty ? (
        <EmptyState>{emptyMessage}</EmptyState>
      ) : (
        <Canvas>
          <ChartRenderer
            ref={chartRendererRef}
            option={option}
            onZoomChange={handleZoomChange}
            isFocused={isFocused}
          />
        </Canvas>
      )}
      <ChartSettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        tabs={resolution.tabs}
        config={resolution.effectiveConfig}
        onSave={onConfigChange}
      />
    </Wrapper>
  )
}
