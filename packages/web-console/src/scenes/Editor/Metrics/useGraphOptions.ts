import { subMinutes } from "date-fns"
import { useContext } from "react"
import { ThemeContext } from "styled-components"
import uPlot from "uplot"
import { MetricDuration, durationInMinutes } from "./utils"

type Params = {
  data: uPlot.AlignedData
  duration: MetricDuration
  tickValue?: (rawValue: number) => string
  xValue?: (rawValue: number, index: number, ticks: number[]) => string | null
  yValue?: (rawValue: number) => string
  timeRef: React.RefObject<HTMLSpanElement>
  valueRef: React.RefObject<HTMLSpanElement>
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
  data,
  duration,
  tickValue = (rawValue) => (+rawValue).toString(),
  xValue,
  yValue = (rawValue) => (+rawValue).toFixed(4),
  timeRef,
  valueRef,
}: Params): Omit<uPlot.Options, "width" | "height"> => {
  const theme = useContext(ThemeContext)
  const now = new Date()

  const start = subMinutes(now, durationInMinutes[duration]).getTime()

  const end = now.getTime()

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
          xValue
            ? xValue(rawValue, index, ticks)
            : new Date(rawValue).toLocaleTimeString(navigator.language, {
                hour: "2-digit",
                minute: "2-digit",
              }),
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
        show: data[0].length === 1,
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
      range: (u, min, max) => {
        return [u.data[0].length > 1 ? min : 0, max]
      },
    },
  }

  return {
    ms: 1,
    padding: [10, 20, 0, 20],

    cursor: {
      sync: {
        key: "wal-metrics",
        setSeries: true,
      },
    },

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