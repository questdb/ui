import { subMinutes } from "date-fns"
import { useContext } from "react"
import { ThemeContext } from "styled-components"
import uPlot from "uplot"
import { MetricDuration, durationInMinutes } from "./types"

type Params = {
  duration: MetricDuration
  tickValue?: (rawValue: number) => string
  yValue?: (rawValue: number) => string
}

export const useGraphOptions = ({
  duration,
  tickValue = (rawValue) => (+rawValue).toString(),
  yValue = (rawValue) => (+rawValue).toFixed(4),
}: Params): Omit<uPlot.Options, "width"> => {
  const theme = useContext(ThemeContext)
  const now = new Date()

  const start = subMinutes(now, durationInMinutes[duration])

  const baseAxisConfig: uPlot.Axis = {
    stroke: theme.color.graphLegend,
    labelFont: `600 12px ${theme.font}`,
    font: `12px ${theme.font}`,
    ticks: {
      show: true,
      stroke: theme.color.gray1,
      width: 2,
      dash: [],
      size: 5,
    },
    grid: {
      stroke: theme.color.selectionDarker,
    },
  }

  const axes: Record<"x" | "y", uPlot.Axis> = {
    x: {
      ...baseAxisConfig,
      values(_self, ticks) {
        return ticks.map((rawValue) =>
          new Date(rawValue).toLocaleTimeString(navigator.language, {
            hour: "2-digit",
            minute: "2-digit",
          }),
        )
      },
    },
    y: {
      ...baseAxisConfig,
      values: (_self, ticks) => ticks.map((rawValue) => tickValue(rawValue)),
    },
  }

  const series: Record<"x" | "y", uPlot.Series> = {
    x: {},
    y: {
      label: "",
      // points: {}
      stroke: theme.color.cyan,
      width: 2,
      value: (_self, rawValue) => yValue(rawValue),
    },
  }

  const scales: uPlot.Scales = {
    x: {
      time: true,
      range: [start.getTime(), now.getTime()],
    },
    y: {
      range: (_u, min, max) =>
        min === null ? [0, 100] : uPlot.rangeNum(min, max, 0.1, true),
    },
  }

  return {
    height: 180,
    ms: 1,
    padding: [10, 20, 0, 10],

    axes: Object.values(axes),
    series: Object.values(series),
    scales,

    legend: {
      show: true,
      markers: {
        show: true,
      },
    },
  }
}
