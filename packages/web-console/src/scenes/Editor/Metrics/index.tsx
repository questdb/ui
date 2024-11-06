import React, { useEffect, useState, useMemo } from "react"
import styled from "styled-components"
import { Box, Select } from "@questdb/react-components"
import { Text } from "../../../components"
import { useEditor } from "../../../providers"
import { MetricDuration } from "./utils"
import { Time } from "@styled-icons/boxicons-regular"
import { fetchUserLocale, getLocaleFromLanguage } from "../../../utils"
import { format } from "date-fns"
import { AddMetricDialog } from "./add-metric-dialog"
import type { Metric } from "../../../store/buffers"
import { Metric as MetricComponent } from "./metric"

const Root = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: #2c2e3d;
  padding-bottom: calc(4.5rem + 2.5rem + 2.5rem);
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
`

const Charts = styled(Box).attrs({
  align: "flex-start",
  gap: "2.5rem",
})`
  align-content: flex-start;
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

const GlobalError = styled(Box).attrs({
  align: "center",
  justifyContent: "center",
})`
  margin: auto;
`

export const Metrics = () => {
  const { activeBuffer, buffers } = useEditor()
  const [metricDuration, setMetricDuration] = useState<MetricDuration>(
    (activeBuffer?.metricsViewState?.metricDuration as MetricDuration) ??
      MetricDuration.SEVEN_DAYS,
  )
  const userLocale = useMemo(fetchUserLocale, [])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [metrics, setMetrics] = useState<Metric[]>([])

  const formatDurationLabel = (duration: MetricDuration) => `Last ${duration}`

  useEffect(() => {
    const metrics = buffers.find((b) => b.id === activeBuffer?.id)
      ?.metricsViewState?.metrics
    if (metrics) {
      setMetrics(metrics)
    }
  }, [buffers, activeBuffer])

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
      <Charts>
        {metrics &&
          metrics
            .sort((a, b) => a.position - b.position)
            .map((metric, index) => (
              <MetricComponent
                key={index}
                metric={metric}
                metricDuration={metricDuration}
              />
            ))}
      </Charts>
    </Root>
  )
}
