import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ChartLineIcon, WarningIcon } from "@phosphor-icons/react"
import styled from "styled-components"
import { AIStopButton } from "../../../components/AIStopButton"
import { Button } from "../../../components/Button"
import { trackEvent } from "../../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../../modules/ConsoleEventTracker/events"
import { normalizeQueryText } from "../../Editor/Monaco/utils"
import { buildEchartsOption } from "../../Editor/Notebook/CellChart/buildEchartsOption"
import {
  ChartRenderer,
  type ChartRendererHandle,
} from "../../Editor/Notebook/CellChart/ChartRenderer"
import { ChartSettingsPanel } from "../../Editor/Notebook/CellChart/ChartSettingsDrawer"
import type { ChartSettingsTelemetry } from "../../Editor/Notebook/CellChart/chartSettingsTelemetry"
import type { ChartConfig } from "../../Editor/Notebook/CellChart/chartTypes"
import { resolveDraw } from "../../Editor/Notebook/DrawCanvas/drawCanvasUtils"
import { CircleNotchSpinner } from "../../Editor/Monaco/icons"
import type { QueryRawResult } from "../../../utils/questdb"
import { Type } from "../../../utils/questdb"
import type { QueryExecResult } from "../../../hooks/useQueryExecution"
import { useChartQuery } from "./useChartQuery"

type ResultChartData = Extract<QueryRawResult, { type: Type.DQL }>

type Props = {
  result: ResultChartData | null
  visible: boolean
}

type SavedConfig = {
  queryKey: string
  value: ChartConfig
}

const Root = styled.section<{ $visible: boolean }>`
  display: ${({ $visible }) => ($visible ? "flex" : "none")};
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: ${({ theme }) => theme.color.surfaceInset};
`

const Canvas = styled.div`
  display: flex;
  position: relative;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
`

const ChartArea = styled.div`
  position: relative;
  flex: 1;
  min-height: 0;
`

const TruncationNotice = styled.div`
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 0.6rem;
  padding: 0.6rem 1.2rem;
  background: ${({ theme }) => theme.color.statusWarningSurface};
  border-bottom: 1px solid ${({ theme }) => theme.color.borderSubtle};
  color: ${({ theme }) => theme.color.contentPrimary};
  font-size: 1.2rem;
  line-height: 1.3;

  svg {
    flex-shrink: 0;
    color: ${({ theme }) => theme.color.statusWarning};
  }
`

const SettingsPlaceholder = styled.aside`
  display: flex;
  width: clamp(26rem, 30%, 34rem);
  flex: 0 0 clamp(26rem, 30%, 34rem);
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  gap: 0.8rem;
  padding: 1.2rem;
  background: ${({ theme }) => theme.color.surfaceRaised};
  border-right: 1px solid ${({ theme }) => theme.color.borderSubtle};
  color: ${({ theme }) => theme.color.contentSecondary};
  font-size: 1.3rem;

  strong {
    color: ${({ theme }) => theme.color.contentPrimary};
    font-size: 1.4rem;
    font-weight: 600;
  }
`

const EmptyState = styled.div<{ $tone?: "danger" }>`
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 3rem;
  color: ${({ theme }) => theme.color.contentSecondary};
  font-size: 1.3rem;
  text-align: center;

  > svg {
    color: ${({ $tone, theme }) =>
      $tone === "danger"
        ? theme.color.statusDanger
        : theme.color.contentDisabled};
  }
`

const LoadingStatus = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.8rem;

  > svg {
    color: ${({ theme }) => theme.color.contentDisabled};
  }
`

const resultChartTelemetry: ChartSettingsTelemetry = {
  onSave: ({ chartType }) => {
    void trackEvent(ConsoleEvent.CHART_DRAW, { chartType, source: "result" })
  },
}

export const ResultChart: React.FC<Props> = ({ result, visible }) => {
  const chartQuery = useChartQuery({ seed: result, enabled: visible })
  const [savedConfig, setSavedConfig] = useState<SavedConfig | null>(null)
  const [zoomStart, setZoomStart] = useState(0)
  const [zoomEnd, setZoomEnd] = useState(100)
  const chartRendererRef = useRef<ChartRendererHandle | null>(null)
  const trackedChartResultRef = useRef<QueryExecResult | null>(null)

  const queryKey = result ? normalizeQueryText(result.query) : ""
  const config =
    savedConfig?.queryKey === queryKey ? savedConfig.value : undefined

  // Both the inferred config and the plotted rows come from the chart's own
  // deeper fetch. Inferring from the grid's 1000-row page instead would let the
  // chart restructure once the fuller result arrives, because partitioning is
  // decided by distinct-value counts over the rows in hand.
  const chartResult = chartQuery.status === "ready" ? chartQuery.result : null

  const resolution = useMemo(
    () =>
      chartResult
        ? resolveDraw([chartResult.query], [chartResult], config)
        : null,
    [chartResult, config],
  )

  const option = useMemo(
    () =>
      resolution
        ? buildEchartsOption(resolution.chart, resolution.renderQueries)
        : null,
    [resolution],
  )

  const hasChartableColumns =
    resolution?.renderQueries.some(
      (query) => query.yColumns.length > 0 || query.ohlc != null,
    ) ?? false

  const shownRowCount = chartResult?.dataset.length ?? 0
  const totalRowCount = chartResult?.count ?? 0
  const isTruncated = totalRowCount > shownRowCount

  useEffect(() => {
    setZoomStart(0)
    setZoomEnd(100)
    chartRendererRef.current?.resetZoom()
  }, [queryKey])

  const handleZoomChange = useCallback((start: number, end: number) => {
    setZoomStart(start)
    setZoomEnd(end)
  }, [])

  let emptyMessage = "Run a query to draw a chart."
  if (chartResult && chartResult.dataset.length === 0) {
    emptyMessage = "This result has no rows to plot."
  } else if (chartResult && !hasChartableColumns) {
    emptyMessage = "This result has no chartable columns."
  }

  const canDraw =
    option !== null &&
    chartResult !== null &&
    chartResult.dataset.length > 0 &&
    hasChartableColumns

  useEffect(() => {
    if (
      !canDraw ||
      chartResult === null ||
      trackedChartResultRef.current === chartResult
    ) {
      return
    }

    const chartType = resolution?.renderQueries[0]?.type
    if (chartType === undefined) return

    trackedChartResultRef.current = chartResult
    void trackEvent(ConsoleEvent.CHART_DRAW, {
      chartType,
      source: "result",
    })
  }, [canDraw, chartResult, resolution])

  let body: React.ReactNode
  if (chartQuery.status === "loading") {
    body = (
      <EmptyState data-hook="result-chart-loading">
        <LoadingStatus>
          <CircleNotchSpinner size={24} />
          <span role="status">Loading chart data…</span>
          <AIStopButton
            size="md"
            onClick={chartQuery.cancel}
            title="Stop chart query"
            ariaLabel="Stop chart query"
            dataHook="result-chart-cancel"
          />
        </LoadingStatus>
      </EmptyState>
    )
  } else if (chartQuery.status === "cancelled") {
    body = (
      <EmptyState data-hook="result-chart-cancelled">
        <ChartLineIcon size={32} weight="regular" aria-hidden />
        <span>Chart loading was cancelled.</span>
        <Button
          variant="secondary"
          size="sm"
          onClick={chartQuery.retry}
          dataHook="result-chart-retry"
        >
          Retry
        </Button>
      </EmptyState>
    )
  } else if (chartQuery.status === "error") {
    body = (
      <EmptyState $tone="danger" data-hook="result-chart-error">
        <WarningIcon size={32} weight="fill" aria-hidden />
        <span>{chartQuery.message}</span>
      </EmptyState>
    )
  } else if (canDraw) {
    body = (
      <Canvas>
        {isTruncated && (
          <TruncationNotice role="status" data-hook="result-chart-truncated">
            <WarningIcon size={14} weight="fill" aria-hidden />
            <span>
              First {shownRowCount.toLocaleString()} of{" "}
              {totalRowCount.toLocaleString()} rows are shown.
            </span>
          </TruncationNotice>
        )}
        <ChartArea>
          <ChartRenderer
            ref={chartRendererRef}
            option={option}
            onZoomChange={handleZoomChange}
            animateEntry={false}
            zoomWindow={{ start: zoomStart, end: zoomEnd }}
          />
        </ChartArea>
      </Canvas>
    )
  } else {
    body = (
      <EmptyState>
        <ChartLineIcon size={32} weight="regular" aria-hidden />
        <span>{emptyMessage}</span>
      </EmptyState>
    )
  }

  return (
    <Root $visible={visible} data-hook="result-chart" aria-hidden={!visible}>
      {chartQuery.status === "loading" ? (
        <SettingsPlaceholder
          data-hook="chart-settings-placeholder"
          aria-hidden
        />
      ) : resolution ? (
        <ChartSettingsPanel
          key={queryKey}
          tabs={resolution.tabs}
          config={resolution.effectiveConfig}
          onSave={(value) => setSavedConfig({ queryKey, value })}
          telemetry={resultChartTelemetry}
        />
      ) : (
        <SettingsPlaceholder data-hook="chart-settings-placeholder">
          <strong>Chart settings</strong>
          <span>Run a query to configure the chart.</span>
        </SettingsPlaceholder>
      )}

      {body}
    </Root>
  )
}
