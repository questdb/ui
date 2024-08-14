import { subMinutes } from "date-fns"
import { useContext } from "react"
import { ThemeContext } from "styled-components"
import uPlot from "uplot"
import { MetricDuration, durationInMinutes } from "../../../modules/Graph/types"

type Params = {
  duration: MetricDuration
  tickValue?: (rawValue: number) => string
  yValue?: (rawValue: number) => string
  timeRef: React.RefObject<HTMLSpanElement>
  valueRef: React.RefObject<HTMLSpanElement>
  startTime: number | null
  endTime: number | null
}

const valuePlugin = (
  timeRef: React.RefObject<HTMLSpanElement>,
  valueRef: React.RefObject<HTMLSpanElement>,
  yValue: (rawValue: number) => string,
) => ({
  hooks: {
    setCursor: (u: uPlot) => {
      if (!timeRef.current || !valueRef.current) {
        return
      }
      const { idx } = u.cursor
      const x = idx !== null && idx !== undefined ? u.data[0][idx] : null
      const y = idx !== null && idx !== undefined ? u.data[1][idx] : null
      if ([y, x].every(Boolean)) {
        const date = new Date(x as number)
        timeRef.current!.textContent = `${date.toLocaleDateString(
          navigator.language,
        )} ${date.toLocaleTimeString(navigator.language)}:`
        valueRef.current!.textContent = yValue(y as number)
      } else {
        timeRef.current!.textContent = null
        valueRef.current!.textContent = null
      }
    },
  },
})

export const useGraphOptions = ({
  duration,
  tickValue = (rawValue) => (+rawValue).toString(),
  yValue = (rawValue) => (+rawValue).toFixed(4),
  timeRef,
  valueRef,
  startTime,
  endTime,
}: Params): Omit<uPlot.Options, "width"> => {
  const theme = useContext(ThemeContext)
  const now = new Date()

  const start =
    startTime ?? subMinutes(now, durationInMinutes[duration]).getTime()

  const end = endTime ?? now.getTime()

  const baseAxisConfig: uPlot.Axis = {
    stroke: theme.color.graphLegend,
    labelFont: `600 12px ${theme.font}`,
    font: `12px ${theme.font}`,
    ticks: {
      show: false,
      stroke: theme.color.gray1,
      width: 2,
      dash: [],
      size: 5,
    },
    grid: {
      stroke: theme.color.selectionDarker,
    },
  }

  const axes: uPlot.Axis[] = [
    {
      ...baseAxisConfig,
      values: (_self, ticks) => {
        return ticks.map((rawValue, index) =>
          index === 0 || index === ticks.length - 1
            ? new Date(rawValue).toLocaleTimeString(navigator.language, {
                hour: "2-digit",
                minute: "2-digit",
              })
            : null,
        )
      },
    },
    {
      ...baseAxisConfig,
      values: (_self, ticks) => ticks.map((rawValue) => yValue(rawValue)),
    },
  ]

  const series: Record<"x" | "y", uPlot.Series> = {
    x: {},
    y: {
      label: "",
      points: {
        show: false,
      },
      stroke: theme.color.cyan,
      width: 2,
      value: (_self, rawValue) => yValue(rawValue),
    },
  }

  const scales: uPlot.Scales = {
    x: {
      time: true,
      range: [start, end],
    },
    y: {
      range: (_u, min, max) => [min, max],
    },
  }

  return {
    height: 180,
    ms: 1,
    padding: [10, 30, 0, 10],

    axes: Object.values(axes),
    series: Object.values(series),
    scales,

    legend: {
      show: false,
      markers: {
        show: false,
      },
    },

    plugins: [valuePlugin(timeRef, valueRef, yValue)],
  }
}
