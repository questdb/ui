import React, { useEffect, useState, useContext } from "react"
import { Metric as MetricItem } from "../../../store/buffers"
import { MetricDuration, MetricType, Latency, RowsApplied } from "./utils"
import { QuestContext } from "../../../providers"
import { latency as latencySQL, rowsApplied as rowsAppliedSQL } from "./queries"
import * as QuestDB from "../../../utils/questdb"
import { Graph } from "./graph"
import uPlot from "uplot"
import styled from "styled-components"
import { Box, Loader } from "@questdb/react-components"
import { Error } from "@styled-icons/boxicons-regular"

const MetricInfoRoot = styled(Box).attrs({
  align: "center",
  justifyContent: "center",
})`
  background-color: ${({ theme }) => theme.color.backgroundLighter};
  height: 25rem;
`

export const Metric = ({
  metric,
  metricDuration,
}: {
  metric: MetricItem
  metricDuration: MetricDuration
}) => {
  const { quest } = useContext(QuestContext)
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<uPlot.AlignedData>()
  const [tableName, setTableName] = useState<string>()

  const fetchLatency = async () =>
    quest.query<Latency>(latencySQL(metric.tableId, metricDuration))

  const fetchRowsApplied = async () =>
    quest.query<RowsApplied>(rowsAppliedSQL(metric.tableId, metricDuration))

  const fetchers = {
    [MetricType.LATENCY]: fetchLatency,
    [MetricType.ROWS_APPLIED]: fetchRowsApplied,
    [MetricType.WRITE_AMPLIFICATION]: fetchRowsApplied,
  }

  const graphDataConfigs = {
    [MetricType.LATENCY]: {
      getData: (latency: Latency[]): uPlot.AlignedData => [
        latency.map((l) => new Date(l.time).getTime()),
        latency.map((l) => parseFloat(l.avg_latency)),
      ],
      yValue: (rawValue: number) => (+rawValue).toFixed(2) + "ms",
    },
    [MetricType.ROWS_APPLIED]: {
      getData: (rowsApplied: RowsApplied[]): uPlot.AlignedData => [
        rowsApplied.map((l) => new Date(l.time).getTime()),
        rowsApplied.map((l) => parseFloat(l.numOfRowsWritten)),
      ],
      yValue: (rawValue: number) => (+rawValue).toFixed(0),
    },
    [MetricType.WRITE_AMPLIFICATION]: {
      getData: (rowsApplied: RowsApplied[]): uPlot.AlignedData => [
        rowsApplied.map((l) => new Date(l.time).getTime()),
        rowsApplied.map((l) => parseFloat(l.avgWalAmplification)),
      ],
      yValue: (rawValue: number) => (+rawValue).toFixed(0) + "x",
    },
  }

  const fetchMetric = async () => {
    setLoading(true)
    try {
      const response = await fetchers[metric.metricType]()
      if (response && response.type === QuestDB.Type.DQL) {
        const alignedData = graphDataConfigs[metric.metricType].getData(
          response.data as any,
        )
        setData(alignedData)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const fetchTableName = async () => {
    try {
      const response = await quest.query<{ table_name: string }>(
        `SELECT table_name FROM tables() WHERE id = ${metric.tableId}`,
      )
      if (response && response.type === QuestDB.Type.DQL) {
        setTableName(response.data[0].table_name)
      }
    } catch (err) {
      console.error
    }
  }

  useEffect(() => {
    fetchMetric()
    fetchTableName()
  }, [metric, metricDuration])

  if ((!data || !tableName) && !loading)
    return (
      <MetricInfoRoot>
        <Error size="18px" />
        Cannot load metric: {metric.metricType}
      </MetricInfoRoot>
    )

  if (loading)
    return (
      <MetricInfoRoot>
        <Loader />
      </MetricInfoRoot>
    )

  return (
    <Graph
      data={data ?? [[], []]}
      loading={loading}
      duration={metricDuration}
      label={`${tableName}: ${metric.metricType as unknown as string}`}
      yValue={graphDataConfigs[metric.metricType].yValue}
    />
  )
}
