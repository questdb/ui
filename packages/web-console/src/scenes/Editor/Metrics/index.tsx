import React, { useContext, useEffect, useState, useMemo } from "react"
import styled from "styled-components"
import { Box, Select } from "@questdb/react-components"
import { Text } from "../../../components"
import { useEditor } from "../../../providers"
import { useSelector } from "react-redux"
import { selectors } from "../../../store"
import { MetricDuration } from "./utils"
import type { Latency, RowsApplied } from "./utils"
import * as QuestDB from "../../../utils/questdb"
import { QuestContext } from "../../../providers"
import { rowsApplied as rowsAppliedSQL, latency as latencySQL } from "./queries"
import { Graph } from "./graph"
import { Time } from "@styled-icons/boxicons-regular"
import isEqual from "lodash.isequal"
import { fetchUserLocale, getLocaleFromLanguage } from "../../../utils"
import { format } from "date-fns"

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
  const { quest } = useContext(QuestContext)
  const { activeBuffer, updateBuffer } = useEditor()
  const tables = useSelector(selectors.query.getTables, (prev, next) => {
    return isEqual(prev, next)
  })
  const [metricDuration, setMetricDuration] = useState<MetricDuration>(
    (activeBuffer?.metricsViewState?.metricDuration as MetricDuration) ??
      MetricDuration.SEVEN_DAYS,
  )
  const [rowsAppliedLoading, setRowsAppliedLoading] = useState(false)
  const [latencyLoading, setLatencyLoading] = useState(false)
  const [rowsApplied, setRowsApplied] = useState<RowsApplied[]>([])
  const [lastNotNullRowsApplied, setLastNotNullRowsApplied] =
    useState<RowsApplied>()
  const [latency, setLatency] = useState<Latency[]>([])
  const [lastNotNullLatency, setLastNotNullLatency] = useState<Latency>()
  const userLocale = useMemo(fetchUserLocale, [])

  const formatDurationLabel = (duration: MetricDuration) => `Last ${duration}`

  const table = tables.find(
    (table) => table.id === activeBuffer?.metricsViewState?.tableId,
  )

  const fetchRowsApplied = async (tableId: number) => {
    setRowsAppliedLoading(true)
    try {
      const response = await quest.query<RowsApplied>(
        rowsAppliedSQL(tableId, metricDuration),
      )
      if (response && response.type === QuestDB.Type.DQL) {
        setRowsApplied(response.data)
        const lastNotNullRowsApplied = response.data
          .slice()
          .reverse()
          .find(
            (l) =>
              l.avgWalAmplification !== null && l.numOfRowsWritten !== null,
          )
        setLastNotNullRowsApplied(lastNotNullRowsApplied)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setRowsAppliedLoading(false)
    }
  }

  const fetchLatency = async (tableId: number) => {
    setLatencyLoading(true)
    try {
      const response = await quest.query<Latency>(
        latencySQL(tableId, metricDuration),
      )
      if (response && response.type === QuestDB.Type.DQL) {
        setLatency(response.data)
        const lastNotNullLatency = response.data
          .slice()
          .reverse()
          .find((l) => l.numOfWalApplies !== null && l.avg_latency !== null)
        setLastNotNullLatency(lastNotNullLatency)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLatencyLoading(false)
    }
  }

  useEffect(() => {
    if (activeBuffer.metricsViewState) {
      fetchLatency(activeBuffer.metricsViewState.tableId)
      fetchRowsApplied(activeBuffer.metricsViewState.tableId)
      setMetricDuration(
        (activeBuffer.metricsViewState.metricDuration as MetricDuration) ??
          MetricDuration.SEVEN_DAYS,
      )
    }
  }, [activeBuffer])

  useEffect(() => {
    if (!activeBuffer.id || !activeBuffer.metricsViewState || !metricDuration)
      return

    updateBuffer(activeBuffer.id, {
      ...activeBuffer,
      metricsViewState: {
        ...activeBuffer.metricsViewState,
        metricDuration,
      },
    })

    fetchLatency(activeBuffer.metricsViewState.tableId)
    fetchRowsApplied(activeBuffer.metricsViewState.tableId)
  }, [metricDuration])

  if (!table)
    return (
      <Root>
        <GlobalError>
          <Text color="foreground">
            Error: Cannot load metrics. Table not found in the database
          </Text>
        </GlobalError>
      </Root>
    )

  return (
    <Root>
      <Toolbar>
        <Header>WAL metrics for {table.table_name}</Header>
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
        <Graph
          loading={latencyLoading}
          label="Read latency in ms"
          duration={metricDuration}
          data={[
            latency.map((l) => new Date(l.time).getTime()),
            latency.map((l) => parseFloat(l.avg_latency)),
          ]}
          yValue={(rawValue: number) => (+rawValue).toFixed(2) + "ms"}
        />
        <Graph
          loading={rowsAppliedLoading}
          label="Write throughput"
          duration={metricDuration}
          data={[
            rowsApplied.map((l) => new Date(l.time).getTime()),
            rowsApplied.map((l) => parseFloat(l.numOfRowsWritten)),
          ]}
          yValue={(rawValue: number) => (+rawValue).toFixed(0)}
        />
        <Graph
          loading={rowsAppliedLoading}
          label="Write amplification"
          duration={metricDuration}
          data={[
            rowsApplied.map((l) => new Date(l.time).getTime()),
            rowsApplied.map((l) => parseFloat(l.avgWalAmplification)),
          ]}
          yValue={(rawValue: number) => (+rawValue).toFixed(0) + "x"}
        />
      </Charts>
    </Root>
  )
}
