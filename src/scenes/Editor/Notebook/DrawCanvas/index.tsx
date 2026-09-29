import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import styled from "styled-components"
import type { QueryExecResult } from "../../../../hooks/useQueryExecution"
import type { NotebookCell } from "../../../../store/notebook"
import type { ChartConfig } from "../CellChart/chartTypes"
import { buildEchartsOption } from "../CellChart/buildEchartsOption"
import {
  ChartRenderer,
  type ChartRendererHandle,
} from "../CellChart/ChartRenderer"
import { chartSettingsSessions } from "../settingsDrawer/settingsDrawerSessions"
import { useSettingsDrawerSession } from "../settingsDrawer/useSettingsDrawerSession"
import type { SettingsDismissMethod } from "../settingsDrawer/SettingsDrawerShell"
import { ChartSettingsDrawer } from "../CellChart/ChartSettingsDrawer"
import { resolveDraw, toChartResult } from "./drawCanvasUtils"
import { Button } from "../../../../components/Button"
import { CircleNotchSpinner } from "../../Monaco/icons"
import { eventBus } from "../../../../modules/EventBus"
import { EventType } from "../../../../modules/EventBus/types"
import {
  shallowEqual,
  useCellFetchSelector,
} from "../cellRefresh/CellRefreshContext"
import {
  pendingCellFetchState,
  type CellFetchState,
} from "../cellRefresh/cellRefreshEngine"
import { useChartLoading } from "../cells/useChartLoading"
import {
  getChartZoom,
  setChartZoom,
} from "../cellVirtualization/chartZoomStore"
import { trackEvent } from "../../../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../../../modules/ConsoleEventTracker/events"
import type { ChartSettingsTelemetry } from "../CellChart/chartSettingsTelemetry"
import { signalUserEdit } from "../../../../utils/notebooks/notebookAIBridge"
import { useNotebookBufferId } from "../NotebookProvider"
import { PaneEmptyState } from "../PaneEmptyState"

const NO_RESULTS: QueryExecResult[] = []

type DrawState = Pick<
  CellFetchState,
  "queries" | "queriesKey" | "settledKey" | "classifyBlock" | "fetchCancelled"
>

// Leaves out `fetching`: the canvas reads it only through `loading`, so a
// refresh of a drawn chart does not re-render it.
const selectDrawState = (
  state: CellFetchState | undefined,
): DrawState | undefined =>
  state && {
    queries: state.queries,
    queriesKey: state.queriesKey,
    settledKey: state.settledKey,
    classifyBlock: state.classifyBlock,
    fetchCancelled: state.fetchCancelled,
  }

const notebookChartSettingsTelemetry: ChartSettingsTelemetry = {
  onCancel: (method) => {
    void trackEvent(ConsoleEvent.NOTEBOOK_CHART_SETTINGS_CANCEL, { method })
  },
  onSave: (payload) => {
    void trackEvent(ConsoleEvent.NOTEBOOK_CHART_SETTINGS_SAVE, payload)
  },
  onSaveBlocked: (reason) => {
    void trackEvent(ConsoleEvent.NOTEBOOK_CHART_SAVE_BLOCKED, { reason })
  },
  onTypeChange: (from, to) => {
    void trackEvent(ConsoleEvent.NOTEBOOK_CHART_TYPE_CHANGE, { from, to })
  },
  onResetAuto: (chartType) => {
    void trackEvent(ConsoleEvent.NOTEBOOK_CHART_RESET_AUTO, { chartType })
  },
}

const trackChartSettingsCancel = (method: SettingsDismissMethod) =>
  notebookChartSettingsTelemetry.onCancel?.(method)

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  position: relative;
  background: ${({ theme }) => theme.color.surfaceInset};
`

const Canvas = styled.div`
  flex: 1;
  min-height: 0;
  position: relative;
  overflow: hidden;
  background: ${({ theme }) => theme.color.surfaceInset};
`

const CancelledState = styled(PaneEmptyState)`
  flex-direction: column;
  gap: 1rem;
`

// Announces loading/empty transitions. Stays mounted with only its text
// changing — inserting an already-populated live region announces
// inconsistently across screen readers.
const VisuallyHiddenStatus = styled.span`
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
`

type Props = {
  cell: NotebookCell
  isFocused: boolean
  onConfigChange: (config: ChartConfig) => void
  onRetryUnmountWhileFocused: () => void
}

export const DrawCanvas: React.FC<Props> = ({
  cell,
  isFocused,
  onConfigChange,
  onRetryUnmountWhileFocused,
}) => {
  const trackSettingsOpen = useCallback(() => {
    void trackEvent(ConsoleEvent.NOTEBOOK_CHART_SETTINGS_OPEN, {
      chartType: cell.chartConfig?.queries.find((q) => q != null)?.type,
    })
  }, [cell.chartConfig])
  const settingsDrawer = useSettingsDrawerSession({
    sessions: chartSettingsSessions,
    cellId: cell.id,
    config: cell.chartConfig,
    openEvent: EventType.NOTEBOOK_CELL_OPEN_CHART_SETTINGS,
    onOpen: trackSettingsOpen,
    onCancel: trackChartSettingsCancel,
    changedWhileOpenMessage:
      "Chart settings were updated by the assistant. Reopen chart configuration to edit.",
  })
  const bufferId = useNotebookBufferId()
  const drawState = useCellFetchSelector(cell.id, selectDrawState, shallowEqual)
  const { loading } = useChartLoading(cell)

  const [zoomStart, setZoomStart] = useState(
    () => getChartZoom(cell.id)?.start ?? 0,
  )
  const [zoomEnd, setZoomEnd] = useState(
    () => getChartZoom(cell.id)?.end ?? 100,
  )

  const chartRendererRef = useRef<ChartRendererHandle | null>(null)

  const state: DrawState = useMemo(
    () => drawState ?? pendingCellFetchState(cell.value),
    [drawState, cell.value],
  )
  const { queries, queriesKey, settledKey, classifyBlock } = state
  const chartResult = useMemo(
    () => toChartResult(cell.result, queries),
    [cell.result, queries],
  )
  const results =
    chartResult.kind === "settled" ? chartResult.results : NO_RESULTS
  const hadError = chartResult.kind === "settled" && chartResult.hadError

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

  // The refresh replaces the cancelled state, and Retry with it; a focused
  // Retry hands its focus on first, like the Stop button does on unmount.
  const handleRetry = (e: React.MouseEvent) => {
    if (e.currentTarget.matches(":focus-visible")) onRetryUnmountWhileFocused()
    signalUserEdit(bufferId)
    void trackEvent(ConsoleEvent.NOTEBOOK_CELL_DRAW)
    eventBus.publish(EventType.NOTEBOOK_CELL_REFRESH_CHART, { cellId: cell.id })
  }

  const option = useMemo(
    () => buildEchartsOption(resolution.chart, resolution.renderQueries),
    [resolution],
  )

  const empty =
    classifyBlock !== null || queries.length === 0 || results.length === 0
  const settledForCurrentQueries = settledKey === queriesKey
  const cancelled = state.fetchCancelled && results.length === 0 && !loading
  let emptyMessage: string
  if (classifyBlock?.kind === "write") {
    emptyMessage = `Cannot draw a write query ('${classifyBlock.queryType}'). Switch to Run mode to execute this SQL.`
  } else if (classifyBlock?.kind === "failed") {
    emptyMessage = `Cannot classify cell SQL (${classifyBlock.message}). Refusing to draw until the query can be classified safely.`
  } else if (queries.length === 0) {
    emptyMessage = "Type a query to draw."
  } else if (!settledForCurrentQueries) {
    emptyMessage = "Drawing…"
  } else if (hadError) {
    emptyMessage = "Query failed: check the SQL editor for the error."
  } else {
    emptyMessage = "No data to plot."
  }

  useEffect(() => {
    const reset = (payload?: { cellId?: string }) => {
      if (payload?.cellId === cell.id) handleResetZoom()
    }
    eventBus.subscribe(EventType.NOTEBOOK_CELL_RESET_ZOOM, reset)
    return () => eventBus.unsubscribe(EventType.NOTEBOOK_CELL_RESET_ZOOM, reset)
  }, [cell.id, handleResetZoom])

  return (
    <Wrapper>
      <VisuallyHiddenStatus role="status">
        {loading
          ? "Loading chart data"
          : cancelled
            ? "Chart loading was cancelled"
            : empty
              ? emptyMessage
              : ""}
      </VisuallyHiddenStatus>
      {loading ? (
        <PaneEmptyState aria-hidden="true">
          <CircleNotchSpinner size={24} />
        </PaneEmptyState>
      ) : cancelled ? (
        <CancelledState data-hook="draw-canvas-cancelled">
          <span aria-hidden="true">Chart loading was cancelled.</span>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleRetry}
            dataHook="draw-canvas-retry"
          >
            Retry
          </Button>
        </CancelledState>
      ) : empty ? (
        <PaneEmptyState aria-hidden="true">{emptyMessage}</PaneEmptyState>
      ) : (
        <Canvas data-hook="draw-canvas">
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
        open={settingsDrawer.open}
        appearInPlace={settingsDrawer.appearInPlace}
        onClose={settingsDrawer.close}
        initialDraft={settingsDrawer.initialDraft}
        onDraftChange={settingsDrawer.keepDraft}
        tabs={resolution.tabs}
        config={resolution.effectiveConfig}
        onSave={onConfigChange}
        telemetry={notebookChartSettingsTelemetry}
      />
    </Wrapper>
  )
}
