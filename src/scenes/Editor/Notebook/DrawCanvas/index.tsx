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
import { resolveDraw } from "./drawCanvasUtils"
import { toast } from "../../../../components/Toast"
import { CircleNotchSpinner } from "../../Monaco/icons"
import { eventBus } from "../../../../modules/EventBus"
import { EventType } from "../../../../modules/EventBus/types"
import { useChartFetchState } from "../chartRefresh/ChartRefreshContext"
import { pendingChartFetchState } from "../chartRefresh/chartRefreshEngine"
import {
  getChartZoom,
  setChartZoom,
} from "../cellVirtualization/chartZoomStore"

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
  isFocused: boolean
  onConfigChange: (config: ChartConfig) => void
}

export const DrawCanvas: React.FC<Props> = ({
  cell,
  isFocused,
  onConfigChange,
}) => {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [zoomStart, setZoomStart] = useState(
    () => getChartZoom(cell.id)?.start ?? 0,
  )
  const [zoomEnd, setZoomEnd] = useState(
    () => getChartZoom(cell.id)?.end ?? 100,
  )

  const configAtSettingsOpenRef = useRef<ChartConfig | undefined>(undefined)
  const chartRendererRef = useRef<ChartRendererHandle | null>(null)

  const fetchState = useChartFetchState(cell.id)
  const {
    queries,
    queriesKey,
    results,
    settledKey,
    lastFetchHadError,
    classifyBlock,
  } = useMemo(
    () => fetchState ?? pendingChartFetchState(cell.value),
    [fetchState, cell.value],
  )

  const isZoomed = zoomStart > 0 || zoomEnd < 100

  const handleZoomChange = useCallback(
    (start: number, end: number) => {
      setZoomStart(start)
      setZoomEnd(end)
      setChartZoom(cell.id, start, end)
    },
    [cell.id],
  )

  const handleResetZoom = useCallback(() => {
    chartRendererRef.current?.resetZoom()
    setZoomStart(0)
    setZoomEnd(100)
    setChartZoom(cell.id, 0, 100)
  }, [cell.id])

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
    emptyMessage = "Drawing…"
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
    const open = forThisCell(openSettings)
    const reset = forThisCell(handleResetZoom)
    eventBus.subscribe(EventType.NOTEBOOK_CELL_OPEN_CHART_SETTINGS, open)
    eventBus.subscribe(EventType.NOTEBOOK_CELL_RESET_ZOOM, reset)
    return () => {
      eventBus.unsubscribe(EventType.NOTEBOOK_CELL_OPEN_CHART_SETTINGS, open)
      eventBus.unsubscribe(EventType.NOTEBOOK_CELL_RESET_ZOOM, reset)
    }
  }, [cell.id, openSettings, handleResetZoom])

  useEffect(() => {
    eventBus.publish(EventType.NOTEBOOK_CELL_CHART_ZOOM, {
      cellId: cell.id,
      zoomed: isZoomed,
    })
  }, [cell.id, isZoomed])

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
            zoomWindow={{ start: zoomStart, end: zoomEnd }}
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
