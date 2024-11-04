import React, { useContext, useEffect, useRef } from "react"
import styled from "styled-components"
import { MetricDuration } from "./utils"
import { useGraphOptions } from "./useGraphOptions"
import uPlot from "uplot"
import UplotReact from "uplot-react"
import { useSelector } from "react-redux"
import { selectors } from "../../../store"
import { ThemeContext } from "styled-components"
import { Box } from "@questdb/react-components"

const NO_DATA_TEXT = "No data available for this period"
const TELEMETRY_DISABLED_TEXT = "Enable Telemetry to see metrics"

const Root = styled(Box).attrs({
  align: "center",
  flexDirection: "column",
  gap: 0,
})`
  position: relative;
  background-color: ${({ theme }) => theme.color.backgroundLighter};
  padding: 1rem;
`

const Header = styled.span`
  font-size: 1.4rem;
  font-weight: 600;
  margin-bottom: 1rem;
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
  loading?: boolean
  data: uPlot.AlignedData
  duration: MetricDuration
  yValue: (rawValue: number) => string
}

export const Graph = ({ label, data, duration, yValue, loading }: Props) => {
  const timeRef = useRef(null)
  const valueRef = useRef(null)
  const uPlotRef = useRef<uPlot>()
  const telemetryConfig = useSelector(selectors.telemetry.getConfig)
  const theme = useContext(ThemeContext)

  let featureUnavailableText: string
  if (!telemetryConfig?.enabled) {
    featureUnavailableText = TELEMETRY_DISABLED_TEXT
  } else {
    featureUnavailableText = NO_DATA_TEXT
  }

  const resizeObserver = new ResizeObserver((entries) => {
    uPlotRef.current?.setSize({
      width: entries[0].contentRect.width,
      height: 200,
    })
  })

  const graphOptions = useGraphOptions({
    data,
    duration,
    timeRef,
    valueRef,
    xValue: (rawValue, index, ticks) =>
      index === 0 || index === ticks.length - 1
        ? new Date(rawValue).toLocaleTimeString(navigator.language, {
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23",
          })
        : null,
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
      <Header>{label}</Header>
      <UplotReact
        options={{
          ...graphOptions,
          height: 200,
          width: graphRootRef.current?.clientWidth
            ? graphRootRef.current.clientWidth - 22
            : 0,
        }}
        data={data}
        onCreate={(uplot) => {
          uPlotRef.current = uplot
          if (uplot.data[0].length === 0 || !telemetryConfig?.enabled) {
            const noData = document.createElement("div")
            noData.innerText = featureUnavailableText
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
    </Root>
  )
}
