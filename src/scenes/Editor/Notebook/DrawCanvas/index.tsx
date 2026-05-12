import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import styled from "styled-components"
import type { NotebookCell } from "../../../../store/notebook"
import type { ChartConfig } from "../CellChart/chartTypes"
import {
  buildEchartsOption,
  type ExtraSeriesSource,
} from "../CellChart/buildEchartsOption"
import {
  classifyColumn,
  ensureChartConfig,
} from "../CellChart/inferChartConfig"
import type { ColumnDefinition } from "../../../../utils/questdb/types"
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
import { QuestContext } from "../../../../providers/QuestProvider"
import { resultsEquivalent, successResults } from "./drawCanvasUtils"

const REFRESH_MIN_MS = 2000
const REFRESH_MAX_MS = 60000

const Wrapper = styled.div<{ $hideActionsUntilHover: boolean }>`
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  position: relative;
  background: ${({ theme }) => theme.color.backgroundLighter};

  ${({ $hideActionsUntilHover }) =>
    $hideActionsUntilHover
      ? `
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
      : ""}
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
  isFocused: boolean
  onConfigChange: (config: ChartConfig) => void
  onAutoRefreshChange: (value: boolean) => void
  onMaximizedChange: (value: boolean) => void
}

const ANCHOR_EMPTY = { columns: [], dataset: [] as never[][], query: "" }

export const DrawCanvas: React.FC<Props> = ({
  cell,
  isFocused,
  onConfigChange,
  onAutoRefreshChange,
  onMaximizedChange,
}) => {
  const { executeSingle } = useQueryExecution()
  const { quest } = useContext(QuestContext)
  const [results, setResults] = useState<QueryExecResult[]>([])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settledKey, setSettledKey] = useState<string | null>(null)
  const [lastFetchHadError, setLastFetchHadError] = useState(false)
  const [classifyBlock, setClassifyBlock] = useState<
    | { kind: "write"; queryType: string }
    | { kind: "failed"; message: string }
    | null
  >(null)
  const classifyCacheRef = useRef<Map<string, "DQL" | "DDL_DML" | "ERROR">>(
    new Map(),
  )
  const classifyCacheValueKeyRef = useRef<string>(cell.value)
  if (classifyCacheValueKeyRef.current !== cell.value) {
    classifyCacheRef.current = new Map()
    classifyCacheValueKeyRef.current = cell.value
  }

  const chartRendererRef = useRef<ChartRendererHandle | null>(null)
  const [zoomStart, setZoomStart] = useState(0)
  const [zoomEnd, setZoomEnd] = useState(100)
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

  const queries = useMemo(() => getQueriesFromText(cell.value), [cell.value])
  const queriesKey = queries.join("\u0001")

  const inFlightRef = useRef<AbortController | null>(null)

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
      const cache = classifyCacheRef.current
      try {
        await Promise.all(
          queries.map(async (q) => {
            if (cache.has(q)) return
            const res = await quest.validateQuery(q)
            if ("error" in res) cache.set(q, "ERROR")
            else if ("columns" in res) cache.set(q, "DQL")
            else cache.set(q, "DDL_DML")
          }),
        )
      } catch (e) {
        const message = e instanceof Error ? e.message : "validate failed"
        setClassifyBlock({ kind: "failed", message })
        setSettledKey(queriesKey)
        return
      }
      const offender = queries
        .map((q) => ({ q, klass: cache.get(q) }))
        .find((x) => x.klass === "DDL_DML")
      if (offender) {
        const validateResult = await quest
          .validateQuery(offender.q)
          .catch(() => null)
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
        queries.map((q) => executeSingle(q, ac.signal).catch(() => null)),
      )
      if (ac.signal.aborted) return
      const next = successResults(out)
      setResults((prev) => (resultsEquivalent(prev, next) ? prev : next))
      setLastFetchHadError(out.some((r) => r === null))
      setSettledKey(queriesKey)
    } finally {
      if (inFlightRef.current === ac) inFlightRef.current = null
    }
  }, [executeSingle, quest, queries, queriesKey])

  useEffect(() => {
    void fetchAll()
  }, [fetchAll])

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

  const anchor = results[0] ?? ANCHOR_EMPTY
  const extras: ExtraSeriesSource[] = useMemo(
    () =>
      results.slice(1).map((r, i) => ({
        label: `Q${i + 2}`,
        columns: r.columns,
        dataset: r.dataset,
      })),
    [results],
  )

  const pickerColumns: ColumnDefinition[] = useMemo(() => {
    const out = [...anchor.columns]
    const seen = new Set(out.map((c) => c.name))
    for (const src of extras) {
      for (const col of src.columns) {
        if (classifyColumn(col) !== "numeric") continue
        if (seen.has(col.name)) continue
        seen.add(col.name)
        out.push(col)
      }
    }
    return out
  }, [anchor.columns, extras])

  const config = useMemo(() => {
    const base = ensureChartConfig(
      cell.chartConfig,
      anchor.columns,
      anchor.dataset,
      anchor.query,
    )
    if (cell.chartConfig) return base
    const all = pickerColumns
      .filter((c) => classifyColumn(c) === "numeric")
      .map((c) => c.name)
    const merged = Array.from(new Set([...base.yColumns, ...all]))
    return { ...base, yColumns: merged }
  }, [cell.chartConfig, anchor, pickerColumns])

  const option = useMemo(
    () => buildEchartsOption(config, anchor.columns, anchor.dataset, extras),
    [config, anchor.columns, anchor.dataset, extras],
  )

  const empty =
    classifyBlock !== null || queries.length === 0 || results.length === 0
  const settledForCurrentQueries = settledKey === queriesKey
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

  return (
    <Wrapper $hideActionsUntilHover={!!cell.isChartMaximized}>
      <ChartActions
        autoRefresh={autoRefresh}
        onAutoRefreshChange={onAutoRefreshChange}
        onManualRefresh={() => void fetchAll()}
        isMaximized={!!cell.isChartMaximized}
        onMaximizedChange={onMaximizedChange}
        onOpenSettings={() => setSettingsOpen(true)}
        canResetZoom={isZoomed}
        onResetZoom={handleResetZoom}
        cellId={cell.id}
      />
      {empty ? (
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
        columns={pickerColumns}
        config={config}
        onSave={onConfigChange}
      />
    </Wrapper>
  )
}
