import React, { useRef, useState, useContext, useEffect } from "react"
import styled from "styled-components"
import { GraphType, Latency, RowsApplied } from "./types"
import * as QuestDB from "../../../utils/questdb"
import { rowsApplied as rowsAppliedSQL, latency as latencySQL } from "./queries"
import { QuestContext } from "../../../providers"
import { Box, Select } from "@questdb/react-components"
import { IconWithTooltip } from "../../../components/IconWithTooltip"
import { Text } from "../../../components/Text"
import { Information } from "@styled-icons/remix-line"
import { useGraphOptions } from "./useGraphOptions"
import { MetricDuration } from "../../../modules/Graph/types"
import UplotReact from "uplot-react"

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

const Value = styled.td`
  background: #21212a;
  text-align: center;
  padding: 0.5rem;
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

const GraphLabel = styled.span`
  font-size: 1.2rem;
  font-weight: 600;
  text-align: center;
`

const ValueText = ({
  text,
  tooltipText,
}: {
  text: React.ReactNode
  tooltipText: string
}) => (
  <IconWithTooltip
    icon={
      <Box gap="0.5rem" align="center" justifyContent="center">
        <Information size="14px" />
        <Text color="foreground">{text}</Text>
      </Box>
    }
    tooltip={tooltipText}
    placement="bottom"
  />
)

export const TableStats = ({ id }: { id: string }) => {
  const { quest } = useContext(QuestContext)
  const [rowsApplied, setRowsApplied] = useState<RowsApplied[]>([])
  const [latency, setLatency] = useState<Latency[]>([])

  const chartTypeConfigs: Record<
    GraphType,
    {
      key: GraphType
      label: string
      isVisible: () => boolean
      data: uPlot.AlignedData
      yValue: (rawValue: number) => string
    }
  > = {
    [GraphType.Latency]: {
      key: GraphType.Latency,
      isVisible: () => latency.length > 0,
      label: "Latency in μs",
      data: [
        latency.map((l) => new Date(l.time).getTime()),
        latency.map((l) => parseFloat(l.avg_latency)),
      ],
      yValue: (rawValue: number) => (+rawValue).toFixed(0) + "μs",
    },
    [GraphType.RowsApplied]: {
      key: GraphType.RowsApplied,
      isVisible: () => rowsApplied.length > 0,
      label: "Rows written/min",
      data: [
        rowsApplied.map((l) => new Date(l.time).getTime()),
        rowsApplied.map((l) => parseFloat(l.numOfRowsWritten)),
      ],
      yValue: (rawValue: number) => (+rawValue).toFixed(0),
    },
    [GraphType.WriteAmplification]: {
      key: GraphType.WriteAmplification,
      isVisible: () => rowsApplied.length > 0,
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
    duration: MetricDuration.TWENTY_FOUR_HOURS,
    timeRef,
    valueRef,
    yValue: chartTypeConfigs[chartType].yValue,
    startTime: latency.length > 0 ? new Date(latency[0].time).getTime() : null,
    endTime:
      latency.length > 0
        ? new Date(latency[latency.length - 1].time).getTime()
        : null,
  })
  const graphRootRef = useRef<HTMLDivElement>(null)

  const fetchRowsApplied = async () => {
    const response = await quest.query<RowsApplied>(rowsAppliedSQL(id))
    if (response && response.type === QuestDB.Type.DQL) {
      setRowsApplied(response.data)
    }
  }

  const fetchLatency = async () => {
    const response = await quest.query<Latency>(latencySQL(id))
    if (response && response.type === QuestDB.Type.DQL) {
      setLatency(response.data)
    }
  }

  useEffect(() => {
    fetchRowsApplied()
    fetchLatency()

    rowsAppliedInterval.current = setInterval(() => {
      fetchRowsApplied()
    }, 10000)

    latencyInterval.current = setInterval(() => {
      fetchLatency()
    }, 10000)

    return () => {
      clearInterval(rowsAppliedInterval.current)
      clearInterval(latencyInterval.current)
    }
  }, [])

  return (
    <Box flexDirection="column" gap="1rem">
      <StyledTable>
        <tbody>
          {latency.length > 0 && (
            <tr>
              <Name>Latency</Name>
              <Value>
                <ValueText
                  text={
                    latency.length > 0 &&
                    parseFloat(latency[latency.length - 1].avg_latency).toFixed(
                      3,
                    ) + "μs"
                  }
                  tooltipText={latency[latency.length - 1].time}
                />
              </Value>
            </tr>
          )}
          {rowsApplied.length > 0 && (
            <tr>
              <Name>Rows written/min</Name>
              <Value>
                <ValueText
                  text={rowsApplied[rowsApplied.length - 1].numOfRowsWritten}
                  tooltipText={rowsApplied[rowsApplied.length - 1].time}
                />
              </Value>
            </tr>
          )}
          {rowsApplied.length > 0 && (
            <tr>
              <Name>Write amplification</Name>
              <Value>
                <ValueText
                  text={
                    rowsApplied[rowsApplied.length - 1].avgWalAmplification +
                    "x"
                  }
                  tooltipText={rowsApplied[rowsApplied.length - 1].time}
                />
              </Value>
            </tr>
          )}
        </tbody>
      </StyledTable>
      <GraphLabel>
        <Select
          name="graphType"
          options={Object.values(chartTypeConfigs)
            .filter((config) => config.isVisible())
            .map((type) => {
              return {
                label: type.label,
                value: type.key,
              }
            })}
          onChange={(e) => setChartType(e.target.value as GraphType)}
        />
      </GraphLabel>
      {chartTypeConfigs[chartType].isVisible() && (
        <UplotReact
          options={{
            ...graphOptions,
            width: graphRootRef.current?.offsetWidth ?? 0,
          }}
          data={chartTypeConfigs[chartType].data}
        />
      )}
      <GraphRoot ref={graphRootRef} />
      <Label>
        <span ref={timeRef} />
        <LabelValue ref={valueRef} />
      </Label>
    </Box>
  )
}
