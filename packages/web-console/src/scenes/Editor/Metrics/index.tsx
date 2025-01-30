import React, { useCallback, useEffect, useState, useRef } from "react"
import styled from "styled-components"
import { Box, Button, Select } from "@questdb/react-components"
import { Text, Link } from "../../../components"
import { useEditor } from "../../../providers"
import {
  RefreshRate,
  refreshRatesInSeconds,
  MetricViewMode,
  getAutoRefreshRate,
} from "./utils"
import type { MetricsRefreshPayload } from "./types"
import { GridAlt, Menu, Refresh } from "@styled-icons/boxicons-regular"
import { AddMetricDialog } from "./add-metric-dialog"
import type { Metric } from "../../../store/buffers"
import { Metric as MetricComponent } from "./metric"
import { useSelector } from "react-redux"
import { selectors } from "../../../store"
import { ExternalLink } from "@styled-icons/remix-line"
import merge from "lodash.merge"
import { AddChart } from "@styled-icons/material"
import { IconWithTooltip } from "../../../components"
import { eventBus } from "../../../modules/EventBus"
import { EventType } from "../../../modules/EventBus/types"
import { formatISO } from "date-fns"
import { DateTimePicker } from "./date-time-picker"
import { ForwardRef } from "@questdb/react-components"
import useElementVisibility from "../../../hooks/useElementVisibility"
import { widgets } from "./widgets"

const Root = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: #2c2e3d;
  padding-bottom: calc(4.5rem);
`

const Toolbar = styled(Box).attrs({
  align: "center",
  justifyContent: "space-between",
})`
  width: 100%;
  height: 4.5rem;
  padding: 0 2.5rem;
  border-bottom: 1px solid
    ${({ theme }: { theme: any }) => theme.color.backgroundDarker};
  box-shadow: 0 2px 10px 0 rgba(23, 23, 23, 0.35);
  white-space: nowrap;
  flex-shrink: 0;
`

const Header = styled(Text)`
  font-size: 1.8rem;
  font-weight: 600;
  color: ${({ theme }: { theme: any }) => theme.color.foreground};
  margin-bottom: 1rem;
`

const Charts = styled(Box).attrs({
  align: "flex-start",
  gap: "2.5rem",
})<{ noMetrics: boolean; viewMode: MetricViewMode }>`
  align-content: ${({ noMetrics }: { noMetrics: any }) =>
    noMetrics ? "center" : "flex-start"};
  padding: 2.5rem;
  overflow-y: auto;
  height: 100%;
  width: 100%;
  flex-wrap: wrap;

  > div {
    width: ${({ viewMode }: { viewMode: any }) =>
      viewMode === MetricViewMode.GRID ? "calc(50% - 1.25rem)" : "100%"};
    flex-shrink: 0;
  }
`

const GlobalInfo = styled(Box).attrs({
  align: "center",
  justifyContent: "center",
})`
  margin: auto;

  code {
    background: #505368;
    color: ${({ theme }: { theme: any }) => theme.color.foreground};
  }
`

export const Metrics = () => {
  const { activeBuffer, updateBuffer, buffers } = useEditor()
  const [metricViewMode, setMetricViewMode] = useState<MetricViewMode>(
    MetricViewMode.GRID,
  )
  const [dateFrom, setDateFrom] = useState<string>(formatISO(new Date()))
  const [dateTo, setDateTo] = useState<string>(formatISO(new Date()))
  const [refreshRate, setRefreshRate] = useState<RefreshRate>()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [metrics, setMetrics] = useState<Metric[]>([])
  const telemetryConfig = useSelector(selectors.telemetry.getConfig)

  const tabInFocusRef = React.useRef<boolean>(true)
  const refreshRateRef = React.useRef<RefreshRate>()
  const intervalRef = React.useRef<NodeJS.Timeout>()

  const buffer = buffers.find((b: any) => b.id === activeBuffer?.id)

  const refreshRateInSec = refreshRate
    ? refreshRate === RefreshRate.AUTO
      ? refreshRatesInSeconds[getAutoRefreshRate(dateFrom, dateTo)]
      : refreshRatesInSeconds[refreshRate]
    : 0

  const updateMetrics = (metrics: Metric[]) => {
    if (buffer?.id) {
      updateBuffer(buffer?.id, {
        metricsViewState: {
          ...buffer?.metricsViewState,
          metrics,
        },
      })
      if (buffer?.metricsViewState?.metrics) {
        buffer.metricsViewState.metrics = metrics
      }
    }
  }

  const refreshMetricsData = (overwrite?: boolean) => {
    eventBus.publish<MetricsRefreshPayload>(EventType.METRICS_REFRESH_DATA, {
      dateFrom,
      dateTo,
      overwrite,
    })
  }

  const handleRemoveMetric = (metric: Metric) => {
    metric.removed = true
    if (buffer?.id && buffer?.metricsViewState?.metrics) {
      updateMetrics(
        buffer?.metricsViewState?.metrics
          .filter((m: Metric) => m.position !== metric.position)
          .map((m: Metric, index: number) => ({ ...m, position: index })),
      )
    }
  }

  const handleTableChange = (metric: Metric, tableId: number) => {
    if (buffer?.id && buffer?.metricsViewState?.metrics) {
      updateMetrics(
        buffer?.metricsViewState?.metrics.map((m: any) =>
          m.position === metric.position ? { ...m, tableId } : m,
        ),
      )
    }
  }

  const handleColorChange = (metric: Metric, color: string) => {
    if (buffer?.id && buffer?.metricsViewState?.metrics) {
      updateMetrics(
        buffer?.metricsViewState?.metrics.map((m: any) =>
          m.position === metric.position ? { ...m, color } : m,
        ),
      )
    }
  }

  const handleDateFromToChange = (dateFrom: string, dateTo: string) => {
    setDateFrom(dateFrom)
    setDateTo(dateTo)
  }

  const handleFullRefresh = () => {
    refreshMetricsData(true)
  }

  const focusListener = useCallback(() => {
    tabInFocusRef.current = true
    if (refreshRateRef.current !== RefreshRate.OFF) {
      refreshMetricsData()
    }
  }, [refreshRateRef.current])

  const blurListener = useCallback(() => {
    tabInFocusRef.current = false
  }, [])

  const [elementRef, isVisible] = useElementVisibility(1000)
  const isVisibleRef = useRef(isVisible)

  useEffect(() => {
    isVisibleRef.current = isVisible
  }, [isVisible])

  const setupListeners = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
    }
    if (refreshRate && refreshRate !== RefreshRate.OFF) {
      intervalRef.current = setInterval(
        () => {
          if (isVisibleRef.current) {
            refreshMetricsData()
          }
        },
        refreshRateInSec > 0 ? refreshRateInSec * 1000 : 0,
      )
    } else {
      clearInterval(intervalRef.current)
    }
  }, [refreshRate, refreshRateInSec, refreshMetricsData])

  useEffect(() => {
    if (buffer) {
      const metrics = buffer?.metricsViewState?.metrics
      const refreshRate = buffer?.metricsViewState?.refreshRate
      const metricViewMode = buffer?.metricsViewState?.viewMode
      const dateFrom = buffer?.metricsViewState?.dateFrom
      const dateTo = buffer?.metricsViewState?.dateTo

      if (dateFrom) {
        setDateFrom(dateFrom)
      }
      if (dateTo) {
        setDateTo(dateTo)
      }
      if (metrics) {
        setMetrics(metrics)
      }
      if (refreshRate) {
        setRefreshRate(refreshRate)
      }
      if (metricViewMode) {
        setMetricViewMode(metricViewMode)
      }
    }
  }, [buffer])

  useEffect(() => {
    if (buffer?.id) {
      // remove all unknown (or obsolete) metrics on startup
      // and also make sure entries without "removed" attribute
      // receive default value
      if (buffer?.metricsViewState?.metrics) {
        buffer.metricsViewState.metrics = buffer.metricsViewState.metrics
          .filter((metric: Metric) => widgets[metric.metricType])
          .map((metric: Metric) => ({ ...metric, removed: false }))
      }

      const merged = merge(buffer, {
        metricsViewState: {
          ...(metricViewMode !== buffer?.metricsViewState?.viewMode && {
            viewMode: metricViewMode,
          }),
          ...(dateFrom !== buffer?.metricsViewState?.dateFrom && {
            dateFrom,
          }),
          ...(dateTo !== buffer?.metricsViewState?.dateTo && {
            dateTo,
          }),
        },
      })

      if (dateFrom && dateTo) {
        if (refreshRate === RefreshRate.AUTO) {
          setupListeners()
        }
      }
      if (dateFrom && dateTo) {
        updateBuffer(buffer.id, merged)
        refreshMetricsData(true)
      }
    }
  }, [metricViewMode, dateFrom, dateTo])

  useEffect(() => {
    if (refreshRate) {
      refreshRateRef.current = refreshRate
      setupListeners()
      if (buffer?.id) {
        updateBuffer(buffer.id, {
          metricsViewState: {
            ...buffer?.metricsViewState,
            refreshRate,
          },
        })
      }
    }
  }, [refreshRate])

  useEffect(() => {
    eventBus.subscribe(EventType.TAB_FOCUS, focusListener)
    eventBus.subscribe(EventType.TAB_BLUR, blurListener)

    return () => {
      eventBus.unsubscribe(EventType.TAB_FOCUS, focusListener)
      eventBus.unsubscribe(EventType.TAB_BLUR, blurListener)
      clearInterval(intervalRef.current)
    }
  }, [])

  if (telemetryConfig && !telemetryConfig.enabled) {
    return (
      <Root>
        <GlobalInfo>
          <Box gap="1.5rem" flexDirection="column">
            <Header>Metrics unavailable</Header>
            <Text color="foreground">
              Enable Telemetry to access WAL table metrics.
            </Text>
            <Text color="foreground">
              Set <code>telemetry.enabled=true</code> in your server.conf file
              and restart the server.
            </Text>
            <Text color="foreground">
              Alternatively, set <code>QDB_TELEMETRY_ENABLED=true</code> ENV var
              for the same effect.
            </Text>
            <Link
              color="cyan"
              hoverColor="cyan"
              href="https://questdb.io/docs/configuration/#telemetry"
              rel="noreferrer"
              target="_blank"
            >
              <Box align="center" gap="0.25rem">
                <ExternalLink size="16px" />
                Documentation
              </Box>
            </Link>
          </Box>
        </GlobalInfo>
      </Root>
    )
  }

  return (
    <Root ref={elementRef}>
      <Toolbar>
        <AddMetricDialog open={dialogOpen} onOpenChange={setDialogOpen} />
        <Box align="center" gap="1rem">
          <Box gap="0.5rem" style={{ flexShrink: 0 }}>
            <IconWithTooltip
              icon={
                <Button skin="secondary" onClick={handleFullRefresh}>
                  <Refresh size="20px" />
                </Button>
              }
              tooltip="Refresh all widgets"
              placement="bottom"
            />
            <IconWithTooltip
              icon={
                <Select
                  name="refresh_rate"
                  value={refreshRate}
                  options={Object.values(RefreshRate).map((rate) => ({
                    label: `Refresh: ${rate}`,
                    value: rate,
                  }))}
                  onChange={(e: any) =>
                    setRefreshRate(e.target.value as RefreshRate)
                  }
                />
              }
              tooltip="Widget refresh rate"
              placement="bottom"
            />
          </Box>
          <IconWithTooltip
            icon={
              <ForwardRef>
                <DateTimePicker
                  dateFrom={dateFrom}
                  dateTo={dateTo}
                  onDateFromToChange={handleDateFromToChange}
                />
              </ForwardRef>
            }
            tooltip="Time duration"
            placement="bottom"
          />
          <IconWithTooltip
            icon={
              <Button
                skin="secondary"
                onClick={() =>
                  setMetricViewMode(
                    metricViewMode === MetricViewMode.GRID
                      ? MetricViewMode.LIST
                      : MetricViewMode.GRID,
                  )
                }
              >
                {metricViewMode === MetricViewMode.LIST ? (
                  <GridAlt size="18px" />
                ) : (
                  <Menu size="18px" />
                )}
              </Button>
            }
            tooltip={
              <>
                Toggle view mode
                <br />
                to {metricViewMode === MetricViewMode.GRID ? "column" : "grid"}
              </>
            }
            placement="bottom"
            textAlign="center"
          />
        </Box>
      </Toolbar>
      <Charts noMetrics={metrics.length === 0} viewMode={metricViewMode}>
        {metrics.length === 0 && (
          <GlobalInfo>
            <Box gap="1.5rem" flexDirection="column">
              <Header>Add your first widget to see metrics</Header>
              <Button
                skin="secondary"
                onClick={() => setDialogOpen(true)}
                prefixIcon={<AddChart size="18px" />}
              >
                Add widget
              </Button>
            </Box>
          </GlobalInfo>
        )}
        {metrics &&
          metrics
            .sort((a: Metric, b: Metric) => a.position - b.position)
            .filter(
              (metric: Metric) => widgets[metric.metricType] && !metric.removed,
            )
            .map((metric: Metric, index: number) => {
              return (
                <MetricComponent
                  dateFrom={dateFrom}
                  dateTo={dateTo}
                  // key is not used by the metric component, but
                  // is required to comply with React requirements for
                  // components that are being added to a list
                  key={index}
                  metric={metric}
                  onRemove={handleRemoveMetric}
                  onTableChange={handleTableChange}
                  onColorChange={handleColorChange}
                />
              )
            })}
      </Charts>
    </Root>
  )
}
