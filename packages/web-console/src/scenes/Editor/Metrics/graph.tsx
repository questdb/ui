import React, { useContext, useEffect, useRef } from "react"
import styled from "styled-components"
import { MetricDuration, xAxisFormat } from "./utils"
import { useGraphOptions } from "./useGraphOptions"
import uPlot from "uplot"
import UplotReact from "uplot-react"
import { ThemeContext } from "styled-components"
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
  label: string
  beforeLabel?: React.ReactNode
  loading?: boolean
  data: uPlot.AlignedData
  colors: string[]
  duration: MetricDuration
  yValue: (rawValue: number) => string
  actions?: React.ReactNode
}

export const Graph = ({
  label,
  beforeLabel,
  data,
  colors,
  duration,
  yValue,
  loading,
  actions,
}: Props) => {
  const timeRef = useRef(null)
  const valueRef = useRef(null)
  const uPlotRef = useRef<uPlot>()
  const theme = useContext(ThemeContext)

  const resizeObserver = new ResizeObserver((entries) => {
    uPlotRef.current?.setSize({
      width: entries[0].contentRect.width,
      height: 200,
    })
  })

  const graphOptions = useGraphOptions({
    data,
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
            if (data[0].length === 0) {
              const noData = document.createElement("div")
              noData.innerText = "No data available for this period"
              noData.style.position = "absolute"
              noData.style.left = "50%"
              noData.style.top = "50%"
              noData.style.transform = "translate(-50%, -50%)"
              noData.style.color = theme.color.gray2
              noData.style.fontSize = "1.2rem"
              noData.style.width = "100%"
              noData.style.textAlign = "center"
              uplot.over.appendChild(noData)
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
