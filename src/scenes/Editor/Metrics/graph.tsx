import { Error } from "@styled-icons/boxicons-regular"
import { Information } from "@styled-icons/remix-line"
import React, { useContext, useEffect, useRef, useState, useMemo } from "react"
import styled, { ThemeContext } from "styled-components"
import uPlot from "uplot"
import UplotReact from "uplot-react"
import { IconWithTooltip, Loader, Text, Box, Button } from "../../../components"
import { createUplotOptions, UplotOptions } from "./createUplotOptions"
import type { DateRange, Widget } from "./types"
import {
  durationTokenToDate,
  getSamplingRateForPeriod,
  getXAxisFormat,
  hasData,
} from "./utils"

const Root = styled(Box).attrs({
  align: "center",
  flexDirection: "column",
  gap: 0,
})`
  position: relative;
  background-color: ${({ theme }) => theme.color.backgroundLighter};
  padding: 0.5rem;
  border-radius: 0.4rem;
  min-height: 0;
  overflow: hidden;
  overflow-y: auto;
`

const Header = styled(Box)`
  position: relative;
  width: 100%;
  gap: 1.5rem;
  padding: 0.5rem 1rem;
  align-items: flex-start;
  justify-content: space-between;
`

const HeaderMeta = styled(Box)`
  flex-shrink: 1;
  min-width: 0;
  flex-wrap: wrap;
`

const BeforeLabel = styled.div`
  min-width: 0;
  overflow: hidden;
  max-width: 100%;
`

const HeaderText = styled.span`
  font-size: 1.4rem;
  line-height: 1.14;
  font-weight: 600;
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

const ErrorIcon = styled(Error)`
  color: ${({ theme }) => theme.color.red};
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
  const colorsString = useMemo(() => colors.join(","), [colors])

  const { isTableMetric, mapYValue, chartTitle } = widgetConfig

  const startTime = new Date(durationTokenToDate(dateFrom)).getTime()
  const endTime = new Date(durationTokenToDate(dateTo)).getTime()

  const [delayedLoading, setDelayedLoading] = useState(loading)
  const [uplotOptions, setUplotOptions] = useState<UplotOptions | undefined>(
    undefined,
  )

  const resizeObserver = useMemo(
    () =>
      new ResizeObserver((entries) => {
        if (entries[0] && uPlotRef.current) {
          uPlotRef.current.setSize({
            width: entries[0].contentRect.width,
            height: 200,
          })
        }
      }),
    [],
  )

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
  }, [data, colorsString])

  const graphRootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (graphRootRef.current) {
      resizeObserver.observe(graphRootRef.current)
    }

    return () => {
      resizeObserver.disconnect()
      if (uPlotRef.current) {
        uPlotRef.current.destroy()
        uPlotRef.current = undefined
      }
    }
  }, [])

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
        <HeaderMeta>
          <BeforeLabel>{beforeLabel}</BeforeLabel>
          <Box gap="0.8rem" margin="0 0 0 0.6rem">
            <HeaderText>{chartTitle}</HeaderText>
            <IconWithTooltip
              icon={
                <Information
                  size="16px"
                  style={{ flexShrink: 0 }}
                  color={theme.color.gray2}
                />
              }
              tooltip={widgetConfig.getDescription({
                lastValue,
                sampleBySeconds: getSamplingRateForPeriod(from, to),
              })}
              placement="bottom"
            />
          </Box>
          {delayedLoading && <Loader size="18px" spin />}
          {hasError && (
            <IconWithTooltip
              icon={<ErrorIcon size="18px" />}
              tooltip="Error fetching latest data, try refreshing manually"
              placement="bottom"
            />
          )}
        </HeaderMeta>
        <Box style={{ flexShrink: 0 }}>{actions}</Box>
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
              onCreate={(uplot) => {
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
