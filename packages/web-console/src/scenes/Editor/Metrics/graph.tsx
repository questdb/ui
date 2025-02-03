import React, { useMemo, useContext, useEffect, useRef, useState } from "react"
import styled, { ThemeContext } from "styled-components"
import type { Widget } from "./types"
import {
  hasData,
  getXAxisFormat,
  durationTokenToDate,
  getSamplingRateForPeriod,
} from "./utils"
import { createUplotOptions, UplotOptions } from "./createUplotOptions"
import uPlot from "uplot"
import UplotReact from "uplot-react"
import { Box, Button, Loader } from "@questdb/react-components"
import { Text } from "../../../components"
import { IconWithTooltip } from "../../../components"
import { Information } from "@styled-icons/remix-line"
import { Error } from "@styled-icons/boxicons-regular"
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
  background-color: ${({ theme }: { theme: any }) =>
    theme.color.backgroundLighter};
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
  font-family: ${({ theme }: { theme: any }) => theme.font};
`

const LabelValue = styled.span`
  color: ${({ theme }: { theme: any }) => theme.color.cyan};
`

const ErrorIcon = styled(Error)`
  color: ${({ theme }: { theme: any }) => theme.color.red};
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
  hasError?: boolean
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
  hasError,
}: Props) => {
  const theme = useContext(ThemeContext)
  const timeRef = useRef(null)
  const valueRef = useRef(null)
  const uPlotRef = useRef<uPlot>()

  const { isTableMetric, mapYValue, chartTitle } = widgetConfig

  const startTime = new Date(durationTokenToDate(dateFrom)).getTime()
  const endTime = new Date(durationTokenToDate(dateTo)).getTime()

  const [delayedLoading, setDelayedLoading] = useState(loading)
  const [uplotOptions, setUplotOptions] = useState<UplotOptions | undefined>(
    undefined,
  )

  const resizeObserver = new ResizeObserver((entries) => {
    uPlotRef.current?.setSize({
      width: entries[0].contentRect.width,
      height: 200,
    })
  })

  const from = durationTokenToDate(dateFrom)
  const to = durationTokenToDate(dateTo)

  useEffect(() => {
    setUplotOptions(
      createUplotOptions({
        data,
        startTime,
        endTime,
        colors,
        timeRef,
        valueRef,
        mapXValue: (rawValue) => getXAxisFormat(rawValue, startTime, endTime),
        mapYValue,
        widgetConfig,
        theme,
      }),
    )
  }, [data])

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

  const lastValue =
    data[1].length > 0
      ? mapYValue(Math.floor(data[1][data[1].length - 1] as number))
      : undefined

  return (
    <Root ref={graphRootRef}>
      <Header>
        <Box gap="0.5rem" align="center">
          <BeforeLabel>{beforeLabel}</BeforeLabel>
          <HeaderText>{chartTitle}</HeaderText>
          <IconWithTooltip
            icon={<Information size="16px" />}
            tooltip={widgetConfig.getDescription({
              lastValue,
              sampleBySeconds: getSamplingRateForPeriod(from, to),
            })}
            placement="bottom"
          />
          {delayedLoading && <Loader size="18px" spin />}
          {hasError && (
            <IconWithTooltip
              icon={<ErrorIcon size="18px" />}
              tooltip="Error fetching latest data, try refreshing manually"
              placement="bottom"
            />
          )}
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
        <div ref={graphRootRef}>
          {uplotOptions && (
            <UplotReact
              options={{
                ...uplotOptions,
                height: 200,
                width: graphRootRef.current?.clientWidth ?? 0,
              }}
              data={data}
              onCreate={(uplot: any) => {
                uPlotRef.current = uplot
              }}
            />
          )}
        </div>
        <Label>
          <span ref={timeRef} />
          <LabelValue ref={valueRef} />
        </Label>
      </GraphWrapper>
    </Root>
  )
}
