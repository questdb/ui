import React, { useCallback, useEffect, useState } from "react"
import styled from "styled-components"
import { Box, Button, Select } from "@questdb/react-components"
import { Text, Link } from "../../../components"
import { useEditor } from "../../../providers"
import {
  MetricDuration,
  RefreshRate,
  autoRefreshRates,
  refreshRatesInSeconds,
  defaultSampleByForDuration,
  getRollingAppendRowLimit,
} from "./utils"
import { Time, Refresh } from "@styled-icons/boxicons-regular"
import { AddMetricDialog } from "./add-metric-dialog"
import type { Metric } from "../../../store/buffers"
import { Metric as MetricComponent } from "./metric"
import { useSelector } from "react-redux"
import { selectors } from "../../../store"
import { ExternalLink } from "@styled-icons/remix-line"
import merge from "lodash.merge"
import { AddChart } from "@styled-icons/material"
import { getLocalTimeZone } from "../../../utils/dateTime"
import { IconWithTooltip } from "../../../components/IconWithTooltip"
import { useLocalStorage } from "../../../providers/LocalStorageProvider"
import { eventBus } from "../../../modules/EventBus"
import { EventType } from "../../../modules/EventBus/types"

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
  border-bottom: 1px solid ${({ theme }) => theme.color.backgroundDarker};
  box-shadow: 0 2px 10px 0 rgba(23, 23, 23, 0.35);
  white-space: nowrap;
`

const Header = styled(Text)`
  font-size: 1.8rem;
  font-weight: 600;
  color: ${({ theme }) => theme.color.foreground};
  margin-bottom: 1rem;
`

const Charts = styled(Box).attrs({
  align: "flex-start",
  gap: "2.5rem",
})<{ noMetrics: boolean }>`
  align-content: ${({ noMetrics }) => (noMetrics ? "center" : "flex-start")};
  padding: 2.5rem;
  overflow-y: auto;
  height: 100%;
  width: 100%;
  flex-wrap: wrap;

  > div {
    width: calc(50% - 1.25rem);
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
    color: ${({ theme }) => theme.color.foreground};
  }
`

const formatDurationLabel = (duration: MetricDuration) => `Last ${duration}`

const formatRefreshRateLabel = (
  rate: RefreshRate,
  duration: MetricDuration,
) => {
  if (rate === RefreshRate.AUTO) {
    return `${RefreshRate.AUTO} (${autoRefreshRates[duration]})`
  }
  return rate
}

export const Metrics = () => {
  const { activeBuffer, updateBuffer, buffers } = useEditor()

  const [metricDuration, setMetricDuration] = useState<MetricDuration>(
    MetricDuration.ONE_HOUR,
  )
  const [refreshRate, setRefreshRate] = useState<RefreshRate>()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [metrics, setMetrics] = useState<Metric[]>([])
  const telemetryConfig = useSelector(selectors.telemetry.getConfig)
  const [lastRefresh, setLastRefresh] = useState<number>(new Date().getTime())

  const tabInFocusRef = React.useRef<boolean>(true)
  const refreshRateRef = React.useRef<RefreshRate>()
  const intervalRef = React.useRef<NodeJS.Timeout>()

  const { autoRefreshTables } = useLocalStorage()

  const buffer = buffers.find((b) => b.id === activeBuffer?.id)

  const refreshRateInSec = refreshRate
    ? refreshRate === RefreshRate.AUTO
      ? refreshRatesInSeconds[autoRefreshRates[metricDuration]] * 1000
      : refreshRatesInSeconds[refreshRate]
    : 0

  const rollingAppendLimit = getRollingAppendRowLimit(
    refreshRateInSec,
    defaultSampleByForDuration[metricDuration],
  )

  const updateMetrics = (metrics: Metric[]) => {
    if (buffer?.id) {
      updateBuffer(buffer?.id, {
        metricsViewState: {
          ...buffer?.metricsViewState,
          metrics,
        },
      })
    }
  }

  const handleRemoveMetric = (metric: Metric) => {
    if (buffer?.id && buffer?.metricsViewState?.metrics) {
      updateMetrics(
        buffer?.metricsViewState?.metrics
          .filter((m) => m.position !== metric.position)
          .map((m, index) => ({ ...m, position: index })),
      )
    }
  }

  const handleTableChange = (metric: Metric, tableId: number) => {
    if (buffer?.id && buffer?.metricsViewState?.metrics) {
      updateMetrics(
        buffer?.metricsViewState?.metrics.map((m) =>
          m.position === metric.position ? { ...m, tableId } : m,
        ),
      )
    }
  }

  const handleColorChange = (metric: Metric, color: string) => {
    if (buffer?.id && buffer?.metricsViewState?.metrics) {
      updateMetrics(
        buffer?.metricsViewState?.metrics.map((m) =>
          m.position === metric.position ? { ...m, color } : m,
        ),
      )
    }
  }

  const focusListener = useCallback(() => {
    tabInFocusRef.current = true
    if (refreshRateRef.current !== RefreshRate.OFF) {
      setLastRefresh(new Date().getTime())
    }
  }, [refreshRateRef.current])

  const blurListener = useCallback(() => {
    tabInFocusRef.current = false
  }, [])

  const setupListeners = () => {
    if (autoRefreshTables && refreshRate && refreshRate !== RefreshRate.OFF) {
      intervalRef.current = setInterval(
        () => {
          if (!tabInFocusRef.current) return
          setLastRefresh(new Date().getTime())
        },
        refreshRateInSec > 0 ? refreshRateInSec * 1000 : 0,
      )
    } else {
      clearInterval(intervalRef.current)
    }
  }

  useEffect(() => {
    if (buffer) {
      const metrics = buffer?.metricsViewState?.metrics
      const metricDuration = buffer?.metricsViewState?.metricDuration
      const refreshRate = buffer?.metricsViewState?.refreshRate
      if (metrics) {
        setMetrics(metrics)
      }
      if (metricDuration) {
        setMetricDuration(metricDuration)
      }
      if (refreshRate) {
        setRefreshRate(refreshRate)
      }
    }
  }, [buffer])

  useEffect(() => {
    if (buffer?.id) {
      const merged = merge(buffer, {
        metricsViewState: {
          ...(metricDuration !== buffer?.metricsViewState?.metricDuration && {
            metricDuration,
          }),
          ...(refreshRate !== buffer?.metricsViewState?.refreshRate && {
            refreshRate,
          }),
        },
      })
      updateBuffer(buffer.id, merged)

      setLastRefresh(new Date().getTime())
    }
  }, [metricDuration, refreshRate])

  useEffect(() => {
    if (refreshRate) {
      refreshRateRef.current = refreshRate
      setupListeners()
    }
  }, [refreshRate])

  useEffect(() => {
    eventBus.subscribe(EventType.TAB_FOCUS, focusListener)
    eventBus.subscribe(EventType.TAB_BLUR, blurListener)

    return () => {
      eventBus.unsubscribe(EventType.TAB_FOCUS, focusListener)
      eventBus.unsubscribe(EventType.TAB_BLUR, blurListener)
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
    <Root>
      <Toolbar>
        {/* <Header>WAL metrics for {table.table_name}</Header> */}
        <AddMetricDialog open={dialogOpen} onOpenChange={setDialogOpen} />
        <Box align="center" gap="1rem">
          <Text color="gray2">{getLocalTimeZone()}</Text>
          <Box gap="0.5rem" style={{ flexShrink: 0 }}>
            <IconWithTooltip
              icon={
                <Button
                  skin="secondary"
                  onClick={() => setLastRefresh(new Date().getTime())}
                >
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
                    label: formatRefreshRateLabel(rate, metricDuration),
                    value: rate,
                  }))}
                  onChange={(e) =>
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
              <Select
                name="duration"
                value={metricDuration}
                options={Object.values(MetricDuration).map((duration) => ({
                  label: formatDurationLabel(duration),
                  value: duration,
                }))}
                onChange={(e) =>
                  setMetricDuration(e.target.value as MetricDuration)
                }
                prefixIcon={<Time size="18px" />}
              />
            }
            tooltip="Time duration"
            placement="bottom"
          />
        </Box>
      </Toolbar>
      <Charts noMetrics={metrics.length === 0}>
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
            .sort((a, b) => a.position - b.position)
            .map((metric, index) => (
              <MetricComponent
                key={index}
                metric={metric}
                metricDuration={metricDuration}
                onRemove={handleRemoveMetric}
                onTableChange={handleTableChange}
                onColorChange={handleColorChange}
                onMetricDurationChange={setMetricDuration}
                lastRefresh={lastRefresh}
              />
            ))}
      </Charts>
    </Root>
  )
}
