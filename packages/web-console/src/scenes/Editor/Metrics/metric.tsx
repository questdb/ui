import React, { useContext, useEffect, useState, useMemo, useCallback } from "react"
import { Metric as MetricItem } from "../../../store/buffers"
import {
  compactSQL,
  durationTokenToDate,
  formatToISOIfNeeded,
  getSamplingRateForPeriod,
  hasData,
  MetricType,
} from "./utils"
import type {
  DateRange,
  LastNotNull,
  MetricsRefreshPayload,
  ResultType,
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
import { IconWithTooltip } from "../../../components"
import { ColorPalette } from "./color-palette"
import { eventBus } from "../../../modules/EventBus"
import { EventType } from "../../../modules/EventBus/types"

const MetricInfoRoot = styled(Box).attrs({
  align: "center",
  justifyContent: "center",
})`
  background-color: ${({ theme }: { theme: any }) =>
    theme.color.backgroundLighter};
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
}: DateRange & {
  metric: MetricItem
  onRemove: (metric: MetricItem) => void
  onTableChange: (metric: MetricItem, tableId: number) => void
  onColorChange: (metric: MetricItem, color: string) => void
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
  const [hasError, setHasError] = useState(false)

  dateFromRef.current = dateFrom
  dateToRef.current = dateTo

  const tables = useSelector(selectors.query.getTables)

  const tableName = tables.find(
    (t: any): boolean => t.id === metric.tableId,
  )?.table_name
  tableNameRef.current = tableName

  const widgetConfig = widgets[metric.metricType]

  if (!dataRef.current && !loading && metric.tableId) {
    metric.tableId = undefined
    return (
      <MetricInfoRoot>
        <Error size="18px" />
        Cannot load metric:{" "}
        {widgetConfig ? widgetConfig.label : metric.metricType}
      </MetricInfoRoot>
    )
  }

  const fetchMetric = useCallback(async () => {
    setLoading(true)
    setHasError(false)
    try {
      const from = durationTokenToDate(dateFromRef.current)
      const to = durationTokenToDate(dateToRef.current)
      const fromIso = formatToISOIfNeeded(from)
      const toIso = formatToISOIfNeeded(to)

      const sampleBySeconds = getSamplingRateForPeriod(from, to)
      const responses = await Promise.all<
        | QuestDB.QueryResult<ResultType[MetricType]>
        | QuestDB.QueryResult<LastNotNull>
      >([
        quest.query<ResultType[MetricType]>(
          compactSQL(
            widgetConfig.getQuery({
              tableId: tableIdRef.current,
              sampleBySeconds: sampleBySeconds,
              from: fromIso,
              to: toIso,
            }),
          ),
        ),
      ])

      if (responses[0] && responses[0].type === QuestDB.Type.DQL) {
        const data = responses[0].data as unknown as ResultType[MetricType][]
        if (data.length > 0 || !from || !to || !sampleBySeconds) {
          // when data exists and chart parameters are known we use the
          // available data, otherwise produce zero line
          dataRef.current = widgetConfig.alignData(data)
        } else {
          // create zero commits/s chart
          const start = Date.parse(from)
          const end = Date.parse(to)
          const buckets = Math.floor((end - start) / 1000 / sampleBySeconds)
          const timestamps = Array.from(
            { length: buckets },
            (_, i) => (start / 1000 + i * sampleBySeconds) * 1000,
          )
          const values = new Array(buckets).fill(0)
          dataRef.current = [timestamps, values]
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
      setHasError(true)
    } finally {
      setLoading(false)
    }
  }, [tableName, widgetConfig, quest])

  const handleZoomToData = () => {
    if (lastNotNull) {
      // zoom to data
    }
  }

  const refreshMetricsData = () => {
    if (tableNameRef.current) {
      fetchMetric()
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
      fetchMetric()
    }
  }, [tableName, widgetConfig])

  useEffect(() => {
    eventBus.subscribe<MetricsRefreshPayload>(
      EventType.METRICS_REFRESH_DATA,
      refreshMetricsData,
    )

    return () => {
      eventBus.unsubscribe(EventType.METRICS_REFRESH_DATA, refreshMetricsData)
    }
  }, [tableName, widgetConfig])

  const canZoomToData = false
  const tableOptions = useMemo(() => {
    return tables.map((t: any) => ({
      label: t.table_name,
      value: t.id.toString(),
      disabled: !t.walEnabled,
    }))
  }, [tables])

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
          options={tableOptions}
          placeholder="Select table"
          onSelect={(value: any) =>
            onTableChange(metric, parseInt(value as string))
          }
          defaultValue={tableNameRef.current || ""}
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
      hasError={hasError}
    />
  )
}
