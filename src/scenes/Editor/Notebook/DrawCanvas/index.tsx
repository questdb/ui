import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import styled from "styled-components"
import type { NotebookCell } from "../../../../store/notebook"
import type { ChartConfig } from "../CellChart/chartTypes"
import { buildEchartsOption } from "../CellChart/buildEchartsOption"
import {
  ChartRenderer,
  type ChartRendererHandle,
} from "../CellChart/ChartRenderer"
import { ChartActions } from "../CellChart/ChartActions"
import { ChartSettingsDrawer } from "../CellChart/ChartSettingsDrawer"
import { useAdaptivePoll } from "../../../../hooks/useAdaptivePoll"
import { useQueryExecution } from "../../../../hooks/useQueryExecution"
import type { QueryExecResult } from "../../../../hooks/useQueryExecution"
import { getQueriesFromText } from "../../Monaco/utils"
import {
  resolveDraw,
  resultsEquivalent,
  successResults,
  toExecResult,
} from "./drawCanvasUtils"
import { useNotebookActions } from "../NotebookProvider"
import { useValidateWithGlobals } from "../globals/useValidateWithGlobals"
import { toast } from "../../../../components/Toast"
import { CircleNotchSpinner } from "../../Monaco/icons"
import {
  capResultBytes,
  NOTEBOOK_BYTE_CAP,
  NOTEBOOK_ROW_CAP,
  singleResultFromExec,
  sqlHash,
} from "../notebookUtils"
import {
  loadCellSnapshot,
  pruneToRecentNotebooks,
  saveCellSnapshot,
} from "../../../../store/notebookResults"

const REFRESH_MIN_MS = 2000
const REFRESH_MAX_MS = 60000
const FETCH_DEBOUNCE_MS = 300
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

  & [data-hook="chart-actions"] {
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.15s ease;
  }
  &:hover [data-hook="chart-actions"],
  & [data-hook="chart-actions"]:focus-within {
    opacity: 1;
    pointer-events: auto;
  }
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
  onAutoRefreshChange: (value: boolean) => void
  onMaximizedChange: (value: boolean) => void
}

export const DrawCanvas: React.FC<Props> = ({
  cell,
  bufferId,
  isFocused,
  onConfigChange,
  onAutoRefreshChange,
  onMaximizedChange,
}) => {
  const { getVariables } = useNotebookActions()
  const { executeSingle } = useQueryExecution(getVariables())
  const validateWithGlobals = useValidateWithGlobals()
  const [results, setResults] = useState<QueryExecResult[]>([])
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
  const lastSnapshotAtRef = useRef(0)

  // Persist a bounded, throttled copy of the chart's rows — shared with run
  // mode (one snapshot per cell) so the chart survives reload without re-fetch.
  const saveDrawSnapshot = useCallback(
    (execResults: QueryExecResult[]) => {
      if (bufferId === undefined) return
      const now = Date.now()
      if (now - lastSnapshotAtRef.current < SNAPSHOT_THROTTLE_MS) return
      lastSnapshotAtRef.current = now
      const results = execResults.map((r) =>
        capResultBytes(singleResultFromExec(r, r.query), NOTEBOOK_BYTE_CAP),
      )
      void saveCellSnapshot({
        bufferId,
        cellId: cell.id,
        sqlHash: sqlHash(debouncedSql),
        results,
        savedAt: now,
      }).then(() => pruneToRecentNotebooks())
    },
    [bufferId, cell.id, debouncedSql],
  )

  const fetchAll = useCallback(async () => {
    if (queries.length === 0) {
      setResults((prev) => (prev.length === 0 ? prev : []))
      setSettledKey(queriesKey)
      setLastFetchHadError(false)
      setClassifyBlock(null)
      return
    }
    inFlightRef.current?.abort()
    const ac = new AbortController()
    inFlightRef.current = ac
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
    } finally {
      if (inFlightRef.current === ac) inFlightRef.current = null
    }
  }, [
    classifyCache,
    executeSingle,
    validateWithGlobals,
    queries,
    queriesKey,
    saveDrawSnapshot,
  ])

  // On mount, render instantly from the persisted snapshot (shared with run
  // mode) when it still matches this cell's SQL. autoRefresh-off cells then stay
  // on the cached frame (no DB hit on load); autoRefresh-on cells let the poll
  // refresh in the background. Falls back to a live fetch when there's no
  // matching snapshot.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (bufferId !== undefined) {
        // Best-effort: a failed read falls through to a live fetch instead of
        // leaving the chart on its loading spinner forever.
        const snap = await loadCellSnapshot(bufferId, cell.id).catch(
          () => undefined,
        )
        if (cancelled) return
        if (snap && snap.sqlHash === sqlHash(debouncedSql)) {
          const hydrated = successResults(snap.results.map(toExecResult))
          if (hydrated.length > 0) {
            // Don't clobber live data that may already have landed.
            setResults((prev) => (prev.length > 0 ? prev : hydrated))
            setSettledKey(queriesKey)
            return
          }
        }
      }
      if (!cancelled) void fetchAll()
    })()
    return () => {
      cancelled = true
    }
  }, [fetchAll, bufferId, cell.id, debouncedSql, queriesKey])

  useEffect(
    () => () => {
      inFlightRef.current?.abort()
    },
    [],
  )

  const autoRefresh = cell.autoRefresh ?? true

  useAdaptivePoll({
    fetchFn: fetchAll,
    enabled: autoRefresh && queries.length > 0,
    key: `${cell.id}:${queriesKey}`,
    minIntervalMs: REFRESH_MIN_MS,
    maxIntervalMs: REFRESH_MAX_MS,
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

  return (
    <Wrapper>
      <ChartActions
        autoRefresh={autoRefresh}
        onAutoRefreshChange={onAutoRefreshChange}
        onManualRefresh={() => void fetchAll()}
        isMaximized={!!cell.isChartMaximized}
        onMaximizedChange={onMaximizedChange}
        onOpenSettings={openSettings}
        canResetZoom={isZoomed}
        onResetZoom={handleResetZoom}
        cellId={cell.id}
      />
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
