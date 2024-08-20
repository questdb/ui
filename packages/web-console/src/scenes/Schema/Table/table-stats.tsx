import React, { useRef, useState, useContext, useEffect } from "react"
import styled from "styled-components"
import { ChartTypeConfig, GraphType, Latency, RowsApplied } from "./types"
import * as QuestDB from "../../../utils/questdb"
import { rowsApplied as rowsAppliedSQL, latency as latencySQL } from "./queries"
import { QuestContext } from "../../../providers"
import { Box, Button, Select } from "@questdb/react-components"
import { IconWithTooltip } from "../../../components/IconWithTooltip"
import { Text } from "../../../components/Text"
import { FileDownload, Information, ZoomIn } from "@styled-icons/remix-line"
import { useGraphOptions } from "./useGraphOptions"
import { MetricDuration } from "../../../modules/Graph/types"
import UplotReact from "uplot-react"
import { MetricsDialog } from "../MetricsDialog"
import { useSelector } from "react-redux"
import { selectors } from "../../../store"
import { ThemeContext } from "styled-components"

const InfoText = styled(Text)`
  font-family: ${({ theme }) => theme.font};
  padding: 0.5rem 0;
`

const StyledTable = styled.table`
  width: 100%;
  border-spacing: 0.5rem;

  td {
    font-size: 1.2rem;
  }
`

const Name = styled.td`
  background: #24252e;
  font-weight: 600;
  padding: 0.5rem 1rem;
`

const Value = styled.td<{ alert?: boolean }>`
  background: ${({ alert }) => (alert ? "#352615" : "#21212a")};
  text-align: center;
  padding: 0.5rem;

  ${({ alert, theme }) =>
    alert &&
    `
  border: 1px #654a2c solid;
  color: ${theme.color.orange};
  `};
`

const GraphRoot = styled.div`
  width: 100%;
`

const Label = styled.div`
  position: absolute;
  bottom: 1rem;
  display: flex;
  gap: 0.5rem;
  font-family: ${({ theme }) => theme.font};
`

const LabelValue = styled.span`
  color: ${({ theme }) => theme.color.cyan};
`

const GraphLabel = styled(Box).attrs({
  gap: "1rem",
  justifyContent: "flex-end",
})`
  font-size: 1.2rem;
  font-weight: 600;
  text-align: center;
  white-space: nowrap;

  select {
    width: min-content;
  }
`

const NO_DATA_TOOLTIP = "No data available for this period"
const TELEMETRY_DISABLED_TOOLTIP = "Enable Telemetry to see metrics"

const ValueText = ({
  text,
  tooltipText,
}: {
  text: React.ReactNode
  tooltipText: string
}) => (
  <IconWithTooltip
    icon={
      <Box gap="0.5rem" align="center" justifyContent="flex-end">
        <Information size="14px" />
        <Text color="foreground">{text}</Text>
      </Box>
    }
    tooltip={tooltipText}
    placement="bottom"
  />
)

export const TableStats = ({
  table_name,
  id,
}: {
  table_name: string
  id: string
}) => {
  const { quest } = useContext(QuestContext)
  const theme = useContext(ThemeContext)
  const telemetryConfig = useSelector(selectors.telemetry.getConfig)
  const [rowsApplied, setRowsApplied] = useState<RowsApplied[]>([])
  const [lastNotNullRowsApplied, setLastNotNullRowsApplied] =
    useState<RowsApplied>()
  const [latency, setLatency] = useState<Latency[]>([])
  const [lastNotNullLatency, setLastNotNullLatency] = useState<Latency>()
  const [isLoading, setIsLoading] = useState(true)
  const [metricDuration, setMetricDuration] = useState<MetricDuration>(
    MetricDuration.SEVEN_DAYS,
  )

  const chartTypeConfigs: Record<GraphType, ChartTypeConfig> = {
    [GraphType.Latency]: {
      key: GraphType.Latency,
      label: "Txn latency in ms",
      data: [
        latency.map((l) => new Date(l.time).getTime()),
        latency.map((l) => parseFloat(l.avg_latency)),
      ],
      yValue: (rawValue: number) => (+rawValue).toFixed(2) + "ms",
    },
    [GraphType.RowsApplied]: {
      key: GraphType.RowsApplied,
      label: "Rows written/min",
      data: [
        rowsApplied.map((l) => new Date(l.time).getTime()),
        rowsApplied.map((l) => parseFloat(l.numOfRowsWritten)),
      ],
      yValue: (rawValue: number) => (+rawValue).toFixed(0),
    },
    [GraphType.WriteAmplification]: {
      key: GraphType.WriteAmplification,
      label: "Write amplification",
      data: [
        rowsApplied.map((l) => new Date(l.time).getTime()),
        rowsApplied.map((l) => parseFloat(l.avgWalAmplification)),
      ],
      yValue: (rawValue: number) => (+rawValue).toFixed(0) + "x",
    },
  }

  const rowsAppliedInterval = useRef<ReturnType<typeof setInterval>>()
  const latencyInterval = useRef<ReturnType<typeof setInterval>>()
  const timeRef = useRef(null)
  const valueRef = useRef(null)
  const [chartType, setChartType] = useState<GraphType>(GraphType.Latency)

  const graphOptions = useGraphOptions({
    data: chartTypeConfigs[chartType].data,
    duration: metricDuration,
    timeRef,
    valueRef,
    xValue: (rawValue, index, ticks) =>
      index === 0 || index === ticks.length - 1
        ? new Date(rawValue).toLocaleTimeString(navigator.language, {
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23",
          })
        : null,
    yValue: chartTypeConfigs[chartType].yValue,
  })
  const graphRootRef = useRef<HTMLDivElement>(null)

  const fetchRowsApplied = async () => {
    const response = await quest.query<RowsApplied>(
      rowsAppliedSQL(id, metricDuration),
    )
    if (response && response.type === QuestDB.Type.DQL) {
      setRowsApplied(response.data)
      const lastNotNullRowsApplied = response.data
        .slice()
        .reverse()
        .find(
          (l) => l.avgWalAmplification !== null && l.numOfRowsWritten !== null,
        )
      setLastNotNullRowsApplied(lastNotNullRowsApplied)
    }
  }

  const fetchLatency = async () => {
    const response = await quest.query<Latency>(latencySQL(id, metricDuration))
    if (response && response.type === QuestDB.Type.DQL) {
      setLatency(response.data)
      const lastNotNullLatency = response.data
        .slice()
        .reverse()
        .find((l) => l.numOfWalApplies !== null && l.avg_latency !== null)
      setLastNotNullLatency(lastNotNullLatency)
    }
  }

  const fetchAll = async () => {
    await fetchRowsApplied()
    await fetchLatency()
    setIsLoading(false)
  }

  const downloadChartData = () => {
    quest.exportQueryToCsv(
      chartType === GraphType.Latency
        ? latencySQL(id, metricDuration)
        : rowsAppliedSQL(id, metricDuration),
    )
  }

  const bootstrap = async () => {
    await fetchAll()
    rowsAppliedInterval.current = setInterval(() => {
      fetchRowsApplied()
    }, 10000)

    latencyInterval.current = setInterval(() => {
      fetchLatency()
    }, 10000)
  }

  useEffect(() => {
    bootstrap()

    return () => {
      clearInterval(rowsAppliedInterval.current)
      clearInterval(latencyInterval.current)
    }
  }, [])

  useEffect(() => {
    clearInterval(rowsAppliedInterval.current)
    clearInterval(latencyInterval.current)
    fetchAll()
  }, [metricDuration])

  if (isLoading) {
    return null
  }

  return (
    <Box flexDirection="column" gap="1rem">
      <StyledTable>
        <tbody>
          <tr>
            <Name>Txn latency</Name>
            <Value>
              <ValueText
                text={
                  lastNotNullLatency
                    ? chartTypeConfigs[GraphType.Latency].yValue(
                        parseFloat(lastNotNullLatency.avg_latency),
                      )
                    : "N/A"
                }
                tooltipText={
                  lastNotNullLatency
                    ? "The delay between the initiation of a database transaction and its successful completion"
                    : telemetryConfig?.enabled
                    ? NO_DATA_TOOLTIP
                    : TELEMETRY_DISABLED_TOOLTIP
                }
              />
            </Value>
          </tr>
          <tr>
            <Name>Rows written/min</Name>
            <Value>
              <ValueText
                text={
                  lastNotNullRowsApplied
                    ? chartTypeConfigs[GraphType.RowsApplied].yValue(
                        parseFloat(lastNotNullRowsApplied.numOfRowsWritten),
                      )
                    : "N/A"
                }
                tooltipText={
                  lastNotNullRowsApplied
                    ? "The number of physical rows written to the database"
                    : telemetryConfig?.enabled
                    ? NO_DATA_TOOLTIP
                    : TELEMETRY_DISABLED_TOOLTIP
                }
              />
            </Value>
          </tr>
          <tr>
            <Name>Write amplification</Name>
            <Value>
              <ValueText
                text={
                  lastNotNullRowsApplied
                    ? chartTypeConfigs[GraphType.WriteAmplification].yValue(
                        parseFloat(lastNotNullRowsApplied.avgWalAmplification),
                      )
                    : "N/A"
                }
                tooltipText={
                  lastNotNullRowsApplied
                    ? "The ratio of the amount of data written to the storage device versus the amount of data written to the database"
                    : telemetryConfig?.enabled
                    ? NO_DATA_TOOLTIP
                    : TELEMETRY_DISABLED_TOOLTIP
                }
              />
            </Value>
          </tr>
        </tbody>
      </StyledTable>
      <GraphLabel>
        <Select
          name="chartType"
          defaultValue={chartType}
          options={Object.values(chartTypeConfigs).map((type) => {
            return {
              label: type.label,
              value: type.key,
            }
          })}
          onChange={(e) => setChartType(e.target.value as GraphType)}
        />
        <Select
          name="duration"
          defaultValue={metricDuration}
          options={[
            {
              label: MetricDuration.TWENTY_FOUR_HOURS,
              value: MetricDuration.TWENTY_FOUR_HOURS,
            },
            {
              label: MetricDuration.THREE_DAYS,
              value: MetricDuration.THREE_DAYS,
            },
            {
              label: MetricDuration.SEVEN_DAYS,
              value: MetricDuration.SEVEN_DAYS,
            },
          ]}
          onChange={(e) => setMetricDuration(e.target.value as MetricDuration)}
        />
      </GraphLabel>
      <Box gap="1rem" align="center" justifyContent="center">
        <IconWithTooltip
          icon={
            <span>
              <MetricsDialog
                trigger={
                  <Button
                    skin="transparent"
                    disabled={chartTypeConfigs[chartType].data[0].length === 0}
                  >
                    <ZoomIn size="18px" />
                  </Button>
                }
                id={id}
                table_name={table_name}
                chartType={chartType}
                chartTypeConfig={chartTypeConfigs[chartType]}
                metricDuration={metricDuration}
              />
            </span>
          }
          tooltip="Display full size chart"
          placement="bottom"
        />
        <IconWithTooltip
          icon={
            <Button
              skin="transparent"
              onClick={downloadChartData}
              disabled={chartTypeConfigs[chartType].data[0].length === 0}
            >
              <FileDownload size="18px" />
            </Button>
          }
          tooltip="Download metrics data"
          placement="bottom"
        />
      </Box>
      <UplotReact
        options={{
          ...graphOptions,
          height: 180,
          width: graphRootRef.current?.offsetWidth ?? 0,
        }}
        data={chartTypeConfigs[chartType].data}
        onCreate={(uplot) => {
          if (uplot.data[0].length === 0 || !telemetryConfig?.enabled) {
            const noData = document.createElement("div")
            noData.innerText = telemetryConfig?.enabled
              ? NO_DATA_TOOLTIP
              : TELEMETRY_DISABLED_TOOLTIP
            noData.style.position = "absolute"
            noData.style.left = "50%"
            noData.style.top = "50%"
            noData.style.transform = "translate(-50%, -50%)"
            noData.style.color = theme.color.gray2
            noData.style.fontSize = "1.2rem"
            noData.style.width = "100%"
            noData.style.textAlign = "center"
            uplot.over.appendChild(noData)
          }
        }}
      />
      <GraphRoot ref={graphRootRef} />
      <Label>
        <span ref={timeRef} />
        <LabelValue ref={valueRef} />
      </Label>
    </Box>
  )
}
