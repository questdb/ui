import React, { useEffect, useState, useMemo } from "react"
import styled from "styled-components"
import { Box, Button, Select } from "@questdb/react-components"
import { Text, Link } from "../../../components"
import { useEditor } from "../../../providers"
import { MetricDuration } from "./utils"
import { Time } from "@styled-icons/boxicons-regular"
import { fetchUserLocale, getLocaleFromLanguage } from "../../../utils"
import { format } from "date-fns"
import { AddMetricDialog } from "./add-metric-dialog"
import type { Metric } from "../../../store/buffers"
import { Metric as MetricComponent } from "./metric"
import { useSelector } from "react-redux"
import { selectors } from "../../../store"
import { ExternalLink } from "@styled-icons/remix-line"
import merge from "lodash.merge"
import { AddChart } from "@styled-icons/material"

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

export const Metrics = () => {
  const { activeBuffer, updateBuffer, buffers } = useEditor()
  const [metricDuration, setMetricDuration] = useState<MetricDuration>(
    (activeBuffer?.metricsViewState?.metricDuration as MetricDuration) ??
      MetricDuration.SEVEN_DAYS,
  )
  const userLocale = useMemo(fetchUserLocale, [])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [metrics, setMetrics] = useState<Metric[]>([])
  const telemetryConfig = useSelector(selectors.telemetry.getConfig)

  const buffer = buffers.find((b) => b.id === activeBuffer?.id)

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

  useEffect(() => {
    const metrics = buffer?.metricsViewState?.metrics
    const metricDuration = buffer?.metricsViewState?.metricDuration
    if (metrics) {
      setMetrics(metrics)
    }
    if (metricDuration) {
      setMetricDuration(metricDuration)
    }
  }, [buffers, activeBuffer])

  useEffect(() => {
    if (
      buffer?.id &&
      metricDuration !== buffer?.metricsViewState?.metricDuration
    ) {
      const merged = merge(buffer, {
        metricsViewState: {
          metricDuration,
        },
      })
      updateBuffer(buffer.id, merged)
    }
  }, [metricDuration])

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
          <Text color="gray2">
            {format(new Date(), "OOOO", {
              locale: getLocaleFromLanguage(userLocale),
            })}
          </Text>
          <Select
            name="duration"
            value={metricDuration}
            options={[
              {
                label: formatDurationLabel(MetricDuration.ONE_HOUR),
                value: MetricDuration.ONE_HOUR,
              },
              {
                label: formatDurationLabel(MetricDuration.THREE_HOURS),
                value: MetricDuration.THREE_HOURS,
              },
              {
                label: formatDurationLabel(MetricDuration.SIX_HOURS),
                value: MetricDuration.SIX_HOURS,
              },
              {
                label: formatDurationLabel(MetricDuration.TWELVE_HOURS),
                value: MetricDuration.TWELVE_HOURS,
              },
              {
                label: formatDurationLabel(MetricDuration.TWENTY_FOUR_HOURS),
                value: MetricDuration.TWENTY_FOUR_HOURS,
              },
              {
                label: formatDurationLabel(MetricDuration.THREE_DAYS),
                value: MetricDuration.THREE_DAYS,
              },
              {
                label: formatDurationLabel(MetricDuration.SEVEN_DAYS),
                value: MetricDuration.SEVEN_DAYS,
              },
            ]}
            onChange={(e) =>
              setMetricDuration(e.target.value as MetricDuration)
            }
            prefixIcon={<Time size="18px" />}
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
              />
            ))}
      </Charts>
    </Root>
  )
}
