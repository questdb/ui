import React, { useEffect, useRef, useState } from "react"
import styled from "styled-components"
import { MetricDuration, Widget, xAxisFormat, hasData } from "./utils"
import { useGraphOptions } from "./useGraphOptions"
import uPlot from "uplot"
import UplotReact from "uplot-react"
import { Box, Button, Loader } from "@questdb/react-components"
import { Text } from "../../../components/Text"

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
  padding: 0 1rem;
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

type Props = {
  dateFrom: Date
  dateTo: Date
  tableId?: number
  tableName?: string
  beforeLabel?: React.ReactNode
  loading?: boolean
  data: uPlot.AlignedData
  canZoomToData?: boolean
  colors: string[]
  duration: MetricDuration
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
  duration,
  loading,
  actions,
  onZoomToData,
  widgetConfig,
}: Props) => {
  const timeRef = useRef(null)
  const valueRef = useRef(null)
  const uPlotRef = useRef<uPlot>()

  const { isTableMetric, mapYValue, label } = widgetConfig

  const resizeObserver = new ResizeObserver((entries) => {
    uPlotRef.current?.setSize({
      width: entries[0].contentRect.width,
      height: 200,
    })
  })

  const graphOptions = useGraphOptions({
    data,
    dateFrom,
    dateTo,
    colors,
    duration,
    timeRef,
    valueRef,
    mapXValue: xAxisFormat[duration],
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

  return (
    <Root ref={graphRootRef}>
      <Header>
        <Box gap="0.5rem" align="center">
          <BeforeLabel>{beforeLabel}</BeforeLabel>
          <HeaderText>{label}</HeaderText>
          {loading && <Loader size="18px" spin />}
        </Box>
        <Actions>{actions}</Actions>
      </Header>
      <GraphWrapper>
        {!hasData(data) && !loading && (
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
