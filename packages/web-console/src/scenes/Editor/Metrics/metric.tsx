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
  MetricDuration,
  MetricType,
  LastNotNull,
  ResultType,
  RefreshRate,
  refreshRates,
  autoRefreshRates,
} from "./utils"
import { widgets } from "./widgets"
import { QuestContext } from "../../../providers"
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

export const Metric = ({
  metric,
  metricDuration,
  refreshRate,
  onRemove,
  onTableChange,
  onColorChange,
  onMetricDurationChange,
  lastRefresh,
}: {
  metric: MetricItem
  metricDuration: MetricDuration
  refreshRate: RefreshRate
  onRemove: (metric: MetricItem) => void
  onTableChange: (metric: MetricItem, tableId: number) => void
  onColorChange: (metric: MetricItem, color: string) => void
  onMetricDurationChange: (duration: MetricDuration) => void
  lastRefresh?: number
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
  const refreshRateRef = useRef<RefreshRate>(refreshRate)

  const { autoRefreshTables } = useLocalStorage()

  const widgetConfig = widgets[metric.metricType]

  const minuteDurations: [MetricDuration, number][] = Object.entries(
    durationInMinutes,
  ) as [MetricDuration, number][]

  const fetchMetric = async () => {
    setLoading(true)
    try {
      const responses = await Promise.all<
        | QuestDB.QueryResult<ResultType[MetricType]>
        | QuestDB.QueryResult<LastNotNull>
      >([
        quest.query<ResultType[MetricType]>(
          widgetConfig.getQuery({
            tableId: metric.tableId,
            metricDuration: metricDurationRef.current,
          }),
        ),
        quest.query<LastNotNull>(
          widgetConfig.getQueryLastNotNull(metric.tableId),
        ),
      ])

      if (responses[0] && responses[0].type === QuestDB.Type.DQL) {
        const alignedData = widgetConfig.alignData(
          responses[0].data as unknown as ResultType[MetricType],
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
      if (refreshRate === RefreshRate.OFF) {
        clearInterval(intervalRef.current)
      } else {
        intervalRef.current = setInterval(
          () => fetchMetric(),
          refreshRate === RefreshRate.AUTO
            ? refreshRates[autoRefreshRates[metricDuration]]
            : refreshRates[refreshRate],
        )
      }
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
    refreshRateRef.current = refreshRate

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
  }, [autoRefreshTables, metricDuration, metric.tableId, refreshRate])

  const focusListener = useCallback(() => {
    if (
      focusListenerRef.current &&
      refreshRateRef.current !== RefreshRate.OFF
    ) {
      fetchMetric()
    }
  }, [metric.tableId, refreshRateRef.current])

  useEffect(() => {
    if (lastRefresh) {
      fetchMetric()
    }
  }, [lastRefresh])

  if (!data && !loading && metric.tableId)
    return (
      <MetricInfoRoot>
        <Error size="18px" />
        Cannot load metric: {widgetConfig.label}
      </MetricInfoRoot>
    )

  const tableName = tables.find((t) => t.id === metric.tableId)?.table_name

  const canZoomToData =
    tableName && lastNotNull
      ? lastNotNull >=
        subMinutes(
          new Date(),
          minuteDurations[minuteDurations.length - 1][1],
        ).getTime()
      : false

  return (
    <Graph
      lastRefresh={lastRefresh}
      data={metric.tableId && data ? data : [[], []]}
      canZoomToData={canZoomToData}
      onZoomToData={handleZoomToData}
      colors={[metric.color]}
      loading={loading}
      duration={metricDuration}
      tableId={metric.tableId}
      tableName={tableName}
      widgetConfig={widgetConfig}
      beforeLabel={
        <TableSelector
          tableId={metric.tableId}
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
