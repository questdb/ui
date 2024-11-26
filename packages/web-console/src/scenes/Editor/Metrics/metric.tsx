import React, {
  useEffect,
  useState,
  useContext,
  useCallback,
  useRef,
} from "react"
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
import { Box, Button, ForwardRef, Popover } from "@questdb/react-components"
import { Error, Palette, Trash } from "@styled-icons/boxicons-regular"
import { useSelector } from "react-redux"
import { selectors } from "../../../store"
import isEqual from "lodash.isequal"
import { useLocalStorage } from "../../../providers/LocalStorageProvider"
import { TableSelector } from "./table-selector"
import { IconWithTooltip } from "../../../components/IconWithTooltip"
import { ColorPalette } from "./color-palette"

const MetricInfoRoot = styled(Box).attrs({
  align: "center",
  justifyContent: "center",
})`
  background-color: ${({ theme }) => theme.color.backgroundLighter};
  height: 25rem;
`

const ActionButton = styled(Button)`
  padding: 0;
  width: 3rem;
`

const graphDataConfigs = {
  [MetricType.LATENCY]: {
    getData: (latency: Latency[]): uPlot.AlignedData => [
      latency.map((l) => new Date(l.time).getTime()),
      latency.map((l) => parseFloat(l.avg_latency)),
    ],
    yValue: (rawValue: number) => (+rawValue).toFixed(2) + " ms",
  },
  [MetricType.ROWS_APPLIED]: {
    getData: (rowsApplied: RowsApplied[]): uPlot.AlignedData => [
      rowsApplied.map((l) => new Date(l.time).getTime()),
      rowsApplied.map((l) => parseFloat(l.numOfRowsWritten)),
    ],
    yValue: (rawValue: number) => {
      if (rawValue >= 1e6) {
        return (rawValue / 1e6).toFixed(1).replace(/\.0$/, "") + " M"
      } else if (rawValue >= 1e3) {
        return (rawValue / 1e3).toFixed(1).replace(/\.0$/, "") + " k"
      }
      return rawValue.toString()
    },
  },
  [MetricType.WRITE_AMPLIFICATION]: {
    getData: (rowsApplied: RowsApplied[]): uPlot.AlignedData => [
      rowsApplied.map((l) => new Date(l.time).getTime()),
      rowsApplied.map((l) => parseFloat(l.avgWalAmplification)),
    ],
    yValue: (rawValue: number) => (+rawValue).toFixed(0) + " x",
  },
}

export const Metric = ({
  metric,
  metricDuration,
  onRemove,
  onTableChange,
  onColorChange,
}: {
  metric: MetricItem
  metricDuration: MetricDuration
  onRemove: (metric: MetricItem) => void
  onTableChange: (metric: MetricItem, tableId: number) => void
  onColorChange: (metric: MetricItem, color: string) => void
}) => {
  const { quest } = useContext(QuestContext)
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<uPlot.AlignedData>()
  const [colorPickerOpen, setColorPickerOpen] = useState(false)
  const metricDurationRef = useRef(metricDuration)

  const tables = useSelector(selectors.query.getTables)

  const intervalRef = React.useRef<NodeJS.Timeout>()
  const focusListenerRef = React.useRef(false)

  const { autoRefreshTables } = useLocalStorage()

  const fetchLatency = async () => {
    if (!metric.tableId) return Promise.reject()
    return quest.query<Latency>(
      latencySQL(metric.tableId, metricDurationRef.current),
    )
  }

  const fetchRowsApplied = async () => {
    if (!metric.tableId) return Promise.reject()
    return quest.query<RowsApplied>(
      rowsAppliedSQL(metric.tableId, metricDurationRef.current),
    )
  }

  const fetchers = {
    [MetricType.LATENCY]: fetchLatency,
    [MetricType.ROWS_APPLIED]: fetchRowsApplied,
    [MetricType.WRITE_AMPLIFICATION]: fetchRowsApplied,
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

  useEffect(() => {
    metricDurationRef.current = metricDuration
    if (metric.tableId) {
      fetchMetric()
    }
  }, [metricDuration, metric.tableId])

  const focusListener = useCallback(() => {
    if (focusListenerRef.current) {
      fetchMetric()
    }
  }, [])

  useEffect(() => {
    if (autoRefreshTables) {
      intervalRef.current = setInterval(() => fetchMetric(), 30000)
      window.addEventListener("focus", focusListener)
      focusListenerRef.current = true
    } else {
      clearInterval(intervalRef.current)
      window.removeEventListener("focus", focusListener)
      focusListenerRef.current = false
    }
  }, [autoRefreshTables])

  if (!data && !loading && metric.tableId)
    return (
      <MetricInfoRoot>
        <Error size="18px" />
        Cannot load metric: {metricTypeLabel[metric.metricType]}
      </MetricInfoRoot>
    )

  const tableName = tables.find((t) => t.id === metric.tableId)?.table_name

  return (
    <Graph
      data={metric.tableId && data ? data : [[], []]}
      colors={[metric.color]}
      loading={loading}
      duration={metricDuration}
      label={metricTypeLabel[metric.metricType]}
      yValue={graphDataConfigs[metric.metricType].yValue}
      beforeLabel={
        <TableSelector
          loading={loading}
          options={tables.map((t) => {
            return {
              label: t.table_name,
              value: t.id.toString(),
              disabled: !t.walEnabled,
            }
          })}
          placeholder="Select table"
          onSelect={(value) => onTableChange(metric, parseInt(value as string))}
          defaultValue={metric.tableId && tableName ? tableName : ""}
        />
      }
      actions={
        <Box gap="0.5rem" align="center">
          <IconWithTooltip
            icon={
              <ForwardRef>
                <Popover
                  open={colorPickerOpen}
                  onOpenChange={setColorPickerOpen}
                  trigger={
                    <ActionButton skin="transparent">
                      <Palette size="18px" />
                    </ActionButton>
                  }
                  align="center"
                >
                  <ColorPalette
                    onSelect={(color) => onColorChange(metric, color)}
                    selectedColor={metric.color}
                  />
                </Popover>
              </ForwardRef>
            }
            tooltip="Choose series color"
            placement="top"
          />
          <IconWithTooltip
            icon={
              <ActionButton skin="transparent" onClick={() => onRemove(metric)}>
                <Trash size="18px" />
              </ActionButton>
            }
            tooltip="Remove metric"
            placement="top"
          />
        </Box>
      }
    />
  )
}
