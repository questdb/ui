import React, { useEffect, useRef, useState } from "react"
import styled from "styled-components"
import type { Widget } from "./types"
import { hasData, getXAxisFormat, durationTokenToDate } from "./utils"
import { useGraphOptions } from "./useGraphOptions"
import uPlot from "uplot"
import UplotReact from "uplot-react"
import { Box, Button, Loader } from "@questdb/react-components"
import { Text } from "../../../components/Text"
import { IconWithTooltip } from "../../../components/IconWithTooltip"
import { Information } from "@styled-icons/remix-line"
import type { DateRange } from "./types"

const Actions = styled.div`
  margin-right: 0;
`

const Root = styled(Box).attrs({
  align: "center",
  flexDirection: "column",
  gap: 0,
})`
  position: relative;
  background-color: ${({ theme }) => theme.color.backgroundLighter};
  height: 25rem;
`

const BeforeLabel = styled.div`
  margin-left: 0;
`

const Header = styled(Box).attrs({
  align: "center",
  justifyContent: "space-between",
})`
  position: relative;
  width: 100%;
`

const HeaderText = styled.span`
  font-size: 1.4rem;
  font-weight: 600;
  padding: 0 0 0 1rem;
`

const GraphWrapper = styled(Box).attrs({
  flexDirection: "column",
  align: "center",
})`
  position: relative;
  padding: 1rem 0;
`

const GraphOverlay = styled(Box).attrs({
  flexDirection: "column",
  align: "center",
  justifyContent: "center",
})`
  width: 100%;
  height: 15rem;
  position: absolute;
  z-index: 1;
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

type Props = DateRange & {
  tableId?: number
  tableName?: string
  beforeLabel?: React.ReactNode
  loading?: boolean
  data: uPlot.AlignedData
  canZoomToData?: boolean
  colors: string[]
  actions?: React.ReactNode
  onZoomToData?: () => void
  widgetConfig: Widget
}

export const Graph = ({
  dateFrom,
  dateTo,
  tableId,
  tableName,
  beforeLabel,
  data,
  canZoomToData,
  colors,
  loading,
  actions,
  onZoomToData,
  widgetConfig,
}: Props) => {
  const timeRef = useRef(null)
  const valueRef = useRef(null)
  const uPlotRef = useRef<uPlot>()
  const [startTime, setStartTime] = useState<number>(
    new Date(durationTokenToDate(dateFrom)).getTime(),
  )
  const [endTime, setEndTime] = useState<number>(
    new Date(durationTokenToDate(dateTo)).getTime(),
  )
  const [delayedLoading, setDelayedLoading] = useState(loading)

  const { isTableMetric, mapYValue, label } = widgetConfig

  const resizeObserver = new ResizeObserver((entries) => {
    uPlotRef.current?.setSize({
      width: entries[0].contentRect.width,
      height: 200,
    })
  })

  useEffect(() => {
    setStartTime(new Date(durationTokenToDate(dateFrom)).getTime())
    setEndTime(new Date(durationTokenToDate(dateTo)).getTime())
  }, [data, dateFrom, dateTo])

  const graphOptions = useGraphOptions({
    data,
    startTime,
    endTime,
    colors,
    timeRef,
    valueRef,
    mapXValue: (rawValue) => getXAxisFormat(rawValue, startTime, endTime),
    mapYValue,
  })

  const graphRootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (graphRootRef.current) {
      resizeObserver.observe(graphRootRef.current)
    }

    return () => {
      resizeObserver.disconnect()
    }
  }, [graphRootRef.current])

  useEffect(() => {
    if (loading) {
      const timeout = setTimeout(() => {
        setDelayedLoading(true)
      }, 1000)
      return () => clearTimeout(timeout)
    }
    setDelayedLoading(false)
  }, [loading])

  return (
    <Root ref={graphRootRef}>
      <Header>
        <Box gap="0.5rem" align="center">
          <BeforeLabel>{beforeLabel}</BeforeLabel>
          <HeaderText>{label}</HeaderText>
          <IconWithTooltip
            icon={<Information size="16px" />}
            tooltip={widgetConfig.description}
            placement="bottom"
          />
          {delayedLoading && <Loader size="18px" spin />}
        </Box>
        <Actions>{actions}</Actions>
      </Header>
      <GraphWrapper>
        {!hasData(data) && (
          <GraphOverlay>
            {isTableMetric && !tableName ? (
              <Text color="gray2">
                {tableId
                  ? "Table does not exist. Please select another one"
                  : "Select a table to see metrics"}
              </Text>
            ) : (
              <Text color="gray2">No data available for this period</Text>
            )}
            {canZoomToData && (
              <Button skin="secondary" onClick={onZoomToData}>
                Zoom to data
              </Button>
            )}
          </GraphOverlay>
        )}
        <UplotReact
          options={{
            ...graphOptions,
            height: 200,
            width: graphRootRef.current?.clientWidth ?? 0,
          }}
          data={data}
          onCreate={(uplot) => {
            uPlotRef.current = uplot
          }}
        />
        <Label>
          <span ref={timeRef} />
          <LabelValue ref={valueRef} />
        </Label>
      </GraphWrapper>
    </Root>
  )
}
