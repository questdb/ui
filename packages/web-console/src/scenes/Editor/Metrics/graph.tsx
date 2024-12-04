import React, { useContext, useEffect, useRef, useState } from "react"
import styled from "styled-components"
import { MetricDuration, xAxisFormat } from "./utils"
import { useGraphOptions } from "./useGraphOptions"
import uPlot from "uplot"
import UplotReact from "uplot-react"
import { Box } from "@questdb/react-components"

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
  padding: 1rem 0;

  .graph-no-data {
    position: absolute;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    width: 100%;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    text-align: center;
  }

  .graph-no-data-text {
    color: ${({ theme }) => theme.color.gray2};
    font-size: 1.4rem;
    text-align: center;
  }

  .graph-no-data-button {
    align-self: center;
    background-color: ${({ theme }) => theme.color.selection};
    border: none;
    color: ${({ theme }) => theme.color.foreground};
    border-radius: 0.4rem;
    height: 3rem;
    padding: 0 1rem;
    cursor: pointer;

    &:hover {
      background-color: ${({ theme }) => theme.color.comment};
    }
  }
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
  lastRefresh?: number
  tableId?: number
  tableName?: string
  isTableMetric: boolean
  label: string
  beforeLabel?: React.ReactNode
  loading?: boolean
  data: uPlot.AlignedData
  canZoomToData?: boolean
  colors: string[]
  duration: MetricDuration
  yValue: (rawValue: number) => string
  actions?: React.ReactNode
  onZoomToData?: () => void
}

export const Graph = ({
  lastRefresh,
  tableId,
  tableName,
  isTableMetric,
  label,
  beforeLabel,
  data,
  canZoomToData,
  colors,
  duration,
  yValue,
  loading,
  actions,
  onZoomToData,
}: Props) => {
  const timeRef = useRef(null)
  const valueRef = useRef(null)
  const uPlotRef = useRef<uPlot>()
  const [dateNow, setDateNow] = useState(new Date())

  const resizeObserver = new ResizeObserver((entries) => {
    uPlotRef.current?.setSize({
      width: entries[0].contentRect.width,
      height: 200,
    })
  })

  const graphOptions = useGraphOptions({
    data,
    dateNow,
    colors,
    duration,
    timeRef,
    valueRef,
    xValue: xAxisFormat[duration],
    yValue,
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
    setDateNow(new Date())
  }, [lastRefresh])

  return (
    <Root ref={graphRootRef}>
      <Header>
        <Box gap="0.5rem" align="center">
          <BeforeLabel>{beforeLabel}</BeforeLabel>
          <HeaderText>{label}</HeaderText>
        </Box>
        <Actions>{actions}</Actions>
      </Header>
      <GraphWrapper>
        <UplotReact
          options={{
            ...graphOptions,
            height: 200,
            width: graphRootRef.current?.clientWidth ?? 0,
          }}
          data={data}
          onCreate={(uplot) => {
            uPlotRef.current = uplot
            if (data[0].length === 0 && !loading) {
              const noData = document.createElement("div")
              noData.className = "graph-no-data"
              uplot.over.appendChild(noData)

              const noDataText = document.createElement("span")
              if (isTableMetric && !tableName) {
                noDataText.innerText = tableId
                  ? "Table does not exist. Please select another one"
                  : "Select a table to see metrics"
              } else {
                noDataText.innerText = "No data available for this period"
              }
              noDataText.className = "graph-no-data-text"
              noData.appendChild(noDataText)

              if (canZoomToData) {
                const zoomToDataButton = document.createElement("button")
                zoomToDataButton.className = "graph-no-data-button"
                zoomToDataButton.innerText = "Zoom to data"
                zoomToDataButton.onclick = () => {
                  if (onZoomToData) {
                    onZoomToData()
                  }
                }
                noData.appendChild(zoomToDataButton)
              }
            }
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
