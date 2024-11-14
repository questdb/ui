import React, { useEffect, useState, useContext } from "react"
import { Metric as MetricItem } from "../../../store/buffers"
import {
  MetricDuration,
  MetricType,
  Latency,
  RowsApplied,
  metricTypeLabel,
} from "./utils"
import { QuestContext } from "../../../providers"
import { latency as latencySQL, rowsApplied as rowsAppliedSQL } from "./queries"
import * as QuestDB from "../../../utils/questdb"
import { Graph } from "./graph"
import uPlot from "uplot"
import styled from "styled-components"
import {
  Box,
  Button,
  ForwardRef,
  Loader,
  DropdownMenu,
  Select,
} from "@questdb/react-components"
import { Error, Menu, Trash } from "@styled-icons/boxicons-regular"
import { Table } from "@styled-icons/remix-line"
import { useSelector } from "react-redux"
import { selectors } from "../../../store"
import SelectSearch from "react-select-search"

const MetricInfoRoot = styled(Box).attrs({
  align: "center",
  justifyContent: "center",
})`
  background-color: ${({ theme }) => theme.color.backgroundLighter};
  height: 25rem;
`

const DropdownMenuContent = styled(DropdownMenu.Content)`
  background: ${({ theme }) => theme.color.backgroundDarker};
`

export const Metric = ({
  metric,
  metricDuration,
  onRemove,
  onTableChange,
}: {
  metric: MetricItem
  metricDuration: MetricDuration
  onRemove: (metric: MetricItem) => void
  onTableChange: (metric: MetricItem, tableId: number) => void
}) => {
  const { quest } = useContext(QuestContext)
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<uPlot.AlignedData>()

  const tables = useSelector(selectors.query.getTables)

  const fetchLatency = async () => {
    if (!metric.tableId) return Promise.reject()
    return quest.query<Latency>(latencySQL(metric.tableId, metricDuration))
  }

  const fetchRowsApplied = async () => {
    if (!metric.tableId) return Promise.reject()
    return quest.query<RowsApplied>(
      rowsAppliedSQL(metric.tableId, metricDuration),
    )
  }

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

  const fetchAll = async () => {
    setLoading(true)
    await fetchMetric()
  }

  useEffect(() => {
    if (metric.tableId) {
      fetchAll()
    }
  }, [metric, metricDuration])

  if (!data && !loading && metric.tableId)
    return (
      <MetricInfoRoot>
        <Error size="18px" />
        Cannot load metric: {metricTypeLabel[metric.metricType]}
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
      data={metric.tableId && data ? data : [[], []]}
      loading={loading}
      duration={metricDuration}
      label={metricTypeLabel[metric.metricType]}
      yValue={graphDataConfigs[metric.metricType].yValue}
      beforeLabel={
        <SelectSearch
          options={tables
            .filter((t) => t.walEnabled)
            .map((t) => {
              return {
                name: t.table_name,
                value: t.id,
              }
            })}
          placeholder="Choose table"
          onChange={(value) => onTableChange(metric, parseInt(value as string))}
          onFocus={() => {}}
          onBlur={() => {}}
          search
          {...(metric.tableId && {
            value: metric.tableId as unknown as string,
          })}
        />
        // <Select
        //   value={metric.tableId}
        //   name="metric-select-table"
        //   prefixIcon={<Table size="18px" />}
        // options={tables
        //   .filter((t) => t.walEnabled)
        //   .map((t) => {
        //     return {
        //       label: t.table_name,
        //       value: t.id,
        //     }
        //   })}
        //   onChange={(e) => {
        //     onTableChange(metric, parseInt(e.target.value))
        //   }}
        // />
      }
      actions={
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <ForwardRef>
              <Button skin="transparent">
                <Menu size="18px" />
              </Button>
            </ForwardRef>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenuContent>
              <DropdownMenu.Item onClick={() => onRemove(metric)}>
                <Trash size="18px" /> Remove
              </DropdownMenu.Item>
            </DropdownMenuContent>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      }
    />
  )
}
