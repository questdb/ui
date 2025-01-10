import React, { useEffect, useState, useContext } from "react"
import { Metric as MetricItem } from "../../../store/buffers"
import {
  MetricType,
  hasData,
  FetchMode,
  mergeRollingData,
  getTimeFilter,
  getSamplingRateForPeriod,
  durationTokenToDate,
} from "./utils"
import type {
  DateRange,
  LastNotNull,
  ResultType,
  MetricsRefreshPayload,
} from "./types"
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
import { TableSelector } from "./table-selector"
import { IconWithTooltip } from "../../../components/IconWithTooltip"
import { ColorPalette } from "./color-palette"
import { eventBus } from "../../../modules/EventBus"
import { EventType } from "../../../modules/EventBus/types"

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
  dateFrom,
  dateTo,
  metric,
  onRemove,
  onTableChange,
  onColorChange,
  fetchMode,
  rollingAppendLimit,
}: DateRange & {
  metric: MetricItem
  onRemove: (metric: MetricItem) => void
  onTableChange: (metric: MetricItem, tableId: number) => void
  onColorChange: (metric: MetricItem, color: string) => void
  fetchMode: FetchMode
  rollingAppendLimit: number
}) => {
  const { quest } = useContext(QuestContext)
  const [loading, setLoading] = useState(metric.tableId !== undefined)
  const [lastNotNull, setLastNotNull] = useState<number>()
  const [colorPickerOpen, setColorPickerOpen] = useState(false)
  const tableIdRef = React.useRef(metric.tableId)
  const dateFromRef = React.useRef(dateFrom)
  const dateToRef = React.useRef(dateTo)
  const dataRef = React.useRef<uPlot.AlignedData>([[], []])
  const tableNameRef = React.useRef<string | undefined>()

  dateFromRef.current = dateFrom
  dateToRef.current = dateTo

  const tables = useSelector(selectors.query.getTables)

  const tableName = tables.find((t) => t.id === metric.tableId)?.table_name
  tableNameRef.current = tableName

  const widgetConfig = widgets[metric.metricType]

  const isRollingAppendEnabled =
    widgetConfig.querySupportsRollingAppend &&
    fetchMode === FetchMode.ROLLING_APPEND

  const fetchMetric = async (overwrite?: boolean) => {
    setLoading(true)
    try {
      const from = durationTokenToDate(dateFromRef.current)
      const to = durationTokenToDate(dateToRef.current)
      const timeFilter = getTimeFilter(from, to)
      const responses = await Promise.all<
        | QuestDB.QueryResult<ResultType[MetricType]>
        | QuestDB.QueryResult<LastNotNull>
      >([
        quest.query<ResultType[MetricType]>(
          widgetConfig.getQuery({
            tableId: tableIdRef.current,
            sampleBy: `${getSamplingRateForPeriod(from, to)}s`,
            timeFilter,
            ...(!overwrite &&
              isRollingAppendEnabled && {
                limit: -rollingAppendLimit,
              }),
          }),
        ),
        // quest.query<LastNotNull>(
        //   widgetConfig.getQueryLastNotNull(tableIdRef.current),
        // ),
      ])

      if (responses[0] && responses[0].type === QuestDB.Type.DQL) {
        const alignedData = widgetConfig.alignData(
          responses[0].data as unknown as ResultType[MetricType],
        )
        if (isRollingAppendEnabled) {
          dataRef.current = mergeRollingData(dataRef.current, alignedData, from)
        } else {
          dataRef.current = alignedData
        }
      }

      if (responses[1] && responses[1].type === QuestDB.Type.DQL) {
        const lastNotNull = responses[1].data[0] as LastNotNull
        setLastNotNull(
          lastNotNull ? new Date(lastNotNull.created).getTime() : undefined,
        )
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleZoomToData = () => {
    if (lastNotNull) {
      // zoom to data
    }
  }

  const refreshMetricsData = (payload?: MetricsRefreshPayload) => {
    if (tableNameRef.current) {
      fetchMetric(payload?.overwrite)
    } else {
      dataRef.current = [[], []]
      setLoading(false)
    }
  }

  useEffect(() => {
    if (tableName) {
      tableNameRef.current = tableName
      tableIdRef.current = metric.tableId
      dataRef.current = [[], []]
      fetchMetric(true)
    }
  }, [tableName])

  useEffect(() => {
    eventBus.subscribe<MetricsRefreshPayload>(
      EventType.METRICS_REFRESH_DATA,
      refreshMetricsData,
    )

    return () => {
      eventBus.unsubscribe(EventType.METRICS_REFRESH_DATA, refreshMetricsData)
    }
  }, [])

  if (!dataRef.current && !loading && metric.tableId)
    return (
      <MetricInfoRoot>
        <Error size="18px" />
        Cannot load metric: {widgetConfig.label}
      </MetricInfoRoot>
    )

  // const canZoomToData = tableName !== undefined && lastNotNull !== undefined
  const canZoomToData = false

  return (
    <Graph
      dateFrom={dateFrom}
      dateTo={dateTo}
      data={
        metric.tableId && hasData(dataRef.current) ? dataRef.current : [[], []]
      }
      canZoomToData={canZoomToData}
      onZoomToData={handleZoomToData}
      colors={[metric.color]}
      loading={loading}
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
