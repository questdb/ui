import React, {
  useEffect,
  useState,
  useContext,
  useCallback,
  useRef,
} from "react"
import { Metric as MetricItem } from "../../../store/buffers"
import {
  durationInMinutes,
  graphDataConfigs,
  MetricDuration,
  MetricType,
  Latency,
  RowsApplied,
  metricTypeLabel,
  LastNotNull,
} from "./utils"
import { QuestContext } from "../../../providers"
import {
  latency as latencySQL,
  rowsApplied as rowsAppliedSQL,
  latencyLastNotNull as latencyLasNotNullSQL,
  rowsAppliedLastNotNull as rowsAppliedLastNotNullSQL,
} from "./queries"
import * as QuestDB from "../../../utils/questdb"
import { Graph } from "./graph"
import uPlot from "uplot"
import styled from "styled-components"
import { Box, Button, ForwardRef, Popover } from "@questdb/react-components"
import { Error, Palette, Trash } from "@styled-icons/boxicons-regular"
import { useSelector } from "react-redux"
import { selectors } from "../../../store"
import { useLocalStorage } from "../../../providers/LocalStorageProvider"
import { TableSelector } from "./table-selector"
import { IconWithTooltip } from "../../../components/IconWithTooltip"
import { ColorPalette } from "./color-palette"
import { subMinutes } from "date-fns"

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

const sqlValueToFixed = (value: string, decimals: number = 2) => {
  const parsed = parseFloat(value)
  return Number(parsed.toFixed(decimals)) as unknown as number
}

export const Metric = ({
  metric,
  metricDuration,
  onRemove,
  onTableChange,
  onColorChange,
  onMetricDurationChange,
}: {
  metric: MetricItem
  metricDuration: MetricDuration
  onRemove: (metric: MetricItem) => void
  onTableChange: (metric: MetricItem, tableId: number) => void
  onColorChange: (metric: MetricItem, color: string) => void
  onMetricDurationChange: (duration: MetricDuration) => void
}) => {
  const { quest } = useContext(QuestContext)
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<uPlot.AlignedData>()
  const [lastNotNull, setLastNotNull] = useState<number>()
  const [colorPickerOpen, setColorPickerOpen] = useState(false)
  const metricDurationRef = useRef(metricDuration)

  const tables = useSelector(selectors.query.getTables)

  const intervalRef = React.useRef<NodeJS.Timeout>()
  const focusListenerRef = React.useRef(false)

  const { autoRefreshTables } = useLocalStorage()

  const minuteDurations: [MetricDuration, number][] = Object.entries(
    durationInMinutes,
  ) as [MetricDuration, number][]

  const fetchLatency = async () => {
    if (!metric.tableId) return Promise.reject()
    return quest.query<Latency>(
      latencySQL(metric.tableId, metricDurationRef.current),
    )
  }

  const fetchLatencyLastNotNull = async () => {
    if (!metric.tableId) return Promise.reject()
    return quest.query<LastNotNull>(latencyLasNotNullSQL(metric.tableId))
  }

  const fetchRowsApplied = async () => {
    if (!metric.tableId) return Promise.reject()
    return quest.query<RowsApplied>(
      rowsAppliedSQL(metric.tableId, metricDurationRef.current),
    )
  }

  const fetchRowsAppliedLastNotNull = async () => {
    if (!metric.tableId) return Promise.reject()
    return quest.query<LastNotNull>(rowsAppliedLastNotNullSQL(metric.tableId))
  }

  const fetchers = {
    [MetricType.LATENCY]: fetchLatency,
    [MetricType.ROWS_APPLIED]: fetchRowsApplied,
    [MetricType.WRITE_AMPLIFICATION]: fetchRowsApplied,
  }

  const fetchersLastNotNull = {
    [MetricType.LATENCY]: fetchLatencyLastNotNull,
    [MetricType.ROWS_APPLIED]: fetchRowsAppliedLastNotNull,
    [MetricType.WRITE_AMPLIFICATION]: fetchRowsAppliedLastNotNull,
  }

  const fetchMetric = async () => {
    setLoading(true)
    try {
      const responses = await Promise.all<
        | QuestDB.QueryResult<RowsApplied>
        | QuestDB.QueryResult<Latency>
        | QuestDB.QueryResult<LastNotNull>
      >([
        fetchers[metric.metricType](),
        fetchersLastNotNull[metric.metricType](),
      ])

      if (responses[0] && responses[0].type === QuestDB.Type.DQL) {
        const alignedData = graphDataConfigs[metric.metricType].alignData(
          responses[0].data as any,
        )
        setData(alignedData)
      }
      if (responses[1] && responses[1].type === QuestDB.Type.DQL) {
        const lastNotNull = responses[1].data[0] as LastNotNull
        if (lastNotNull) {
          setLastNotNull(new Date(lastNotNull.created).getTime())
        }
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleZoomToData = () => {
    if (lastNotNull) {
      const durationsWithData = minuteDurations.filter(
        (d) => lastNotNull >= subMinutes(new Date(), d[1]).getTime(),
      )
      if (durationsWithData.length) {
        onMetricDurationChange(durationsWithData[0][0])
      }
    }
  }

  const setupListeners = () => {
    if (autoRefreshTables) {
      intervalRef.current = setInterval(() => fetchMetric(), 30000)
      window.addEventListener("focus", focusListener)
      focusListenerRef.current = true
    } else {
      clearInterval(intervalRef.current)
      window.removeEventListener("focus", focusListener)
      focusListenerRef.current = false
    }
  }

  useEffect(() => {
    metricDurationRef.current = metricDuration

    if (metric.tableId) {
      fetchMetric()
      setupListeners()
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
      if (focusListenerRef.current) {
        window.removeEventListener("focus", focusListener)
        focusListenerRef.current = false
      }
    }
  }, [autoRefreshTables, metricDuration, metric.tableId])

  const focusListener = useCallback(() => {
    if (focusListenerRef.current) {
      fetchMetric()
    }
  }, [metric.tableId])

  if (!data && !loading && metric.tableId)
    return (
      <MetricInfoRoot>
        <Error size="18px" />
        Cannot load metric: {metricTypeLabel[metric.metricType]}
      </MetricInfoRoot>
    )

  const tableName = tables.find((t) => t.id === metric.tableId)?.table_name

  const canZoomToData = lastNotNull
    ? lastNotNull >=
      subMinutes(
        new Date(),
        minuteDurations[minuteDurations.length - 1][1],
      ).getTime()
    : false

  return (
    <Graph
      data={metric.tableId && data ? data : [[], []]}
      canZoomToData={canZoomToData}
      onZoomToData={handleZoomToData}
      colors={[metric.color]}
      loading={loading}
      duration={metricDuration}
      label={metricTypeLabel[metric.metricType]}
      yValue={graphDataConfigs[metric.metricType].mapYValue}
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
