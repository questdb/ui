import { Error } from "../../../components/icons"
import { Information } from "../../../components/icons"
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
import { editorCardHeaderStyles } from "../sharedStyles"

const Root = styled(Box).attrs({
  align: "center",
  flexDirection: "column",
  gap: 0,
})`
  position: relative;
  background-color: ${({ theme }) => theme.color.surfaceRaised};
  border: 1px solid ${({ theme }) => theme.color.borderDefault};
  border-radius: 0.8rem;
  padding: 0;
  min-height: 0;
  overflow: hidden;
  overflow-y: auto;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;

  &:hover {
    border-color: ${({ theme }) => theme.color.borderDefault};
    box-shadow: 0 16px 44px ${({ theme }) => theme.color.shadowSoft};
  }
`

const Header = styled(Box)`
  ${editorCardHeaderStyles}
  position: relative;
  width: 100%;
  gap: 1.5rem;
`

const HeaderMeta = styled(Box)`
  align-items: center;
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
`

const BeforeLabel = styled.div`
  flex: 0 1 12rem;
  width: 12rem;
  min-width: 0;
  overflow: hidden;
`

const TitleInfo = styled(Box).attrs({
  align: "center",
  gap: "0.8rem",
})`
  flex: 1 1 auto;
  min-width: 0;
  margin-left: 0.6rem;
`

const HeaderText = styled.span`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: ${({ theme }) => theme.color.contentPrimary};
  font-size: 1.4rem;
  line-height: 1.14;
  font-weight: 600;
`

const GraphWrapper = styled(Box).attrs({
  flexDirection: "column",
  align: "center",
})`
  position: relative;
  width: 100%;
  padding: 0.4rem 0 0;
  overflow: hidden;
  background: ${({ theme }) => theme.color.surfaceInset};
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
  color: ${({ theme }) => theme.color.contentAccent};
`

const ErrorIcon = styled(Error)`
  color: ${({ theme }) => theme.color.statusDanger};
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
  }, [data, colorsString, theme])

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
          <TitleInfo>
            <HeaderText>{chartTitle}</HeaderText>
            <IconWithTooltip
              icon={
                <Information
                  size="16px"
                  style={{ flexShrink: 0 }}
                  color={theme.color.contentSecondary}
                />
              }
              tooltip={widgetConfig.getDescription({
                lastValue,
                sampleBySeconds: getSamplingRateForPeriod(from, to),
              })}
              placement="bottom"
            />
          </TitleInfo>
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
              <Text color="contentSecondary">
                {tableId
                  ? "Table does not exist. Please select another one"
                  : "Select a table to see metrics"}
              </Text>
            ) : (
              <Text color="contentSecondary">
                No data available for this period
              </Text>
            )}
            {canZoomToData && (
              <Button variant="secondary" onClick={onZoomToData}>
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
