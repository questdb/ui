import { utcToLocal } from "./../../../utils/dateTime"
import { useContext } from "react"
import { ThemeContext } from "styled-components"
import uPlot from "uplot"
import { DATETIME_FORMAT } from "./utils"
import { Widget } from "./types"

type Params = {
  data: uPlot.AlignedData
  startTime: number
  endTime: number
  colors: string[]
  tickValue?: (rawValue: number) => string
  mapXValue: (rawValue: number, index: number, ticks: number[]) => string
  mapYValue: (rawValue: number) => number | string
  timeRef: React.RefObject<HTMLSpanElement>
  valueRef: React.RefObject<HTMLSpanElement>
  widgetConfig: Widget
}

const valuePlugin = (
  timeRef: React.RefObject<HTMLSpanElement>,
  valueRef: React.RefObject<HTMLSpanElement>,
  mapYValue: Params["mapYValue"],
) => ({
  hooks: {
    setCursor: (u: uPlot) => {
      if (!timeRef.current || !valueRef.current) {
        return
      }
      const { idx } = u.cursor
      const x = idx !== null && idx !== undefined ? u.data[0][idx] : null
      const y = idx !== null && idx !== undefined ? u.data[1][idx] : null
      if ([y, x].every((v) => v !== null)) {
        timeRef.current!.textContent = utcToLocal(
          x as number,
          DATETIME_FORMAT,
        ) as string
        valueRef.current!.textContent = mapYValue(y as number) as string
      } else {
        timeRef.current!.textContent = null
        valueRef.current!.textContent = null
      }
    },
  },
})

export const useGraphOptions = ({
  data,
  startTime,
  endTime,
  colors,
  tickValue = (rawValue) => (+rawValue).toString(),
  mapXValue,
  mapYValue = (rawValue) => (+rawValue).toFixed(4),
  timeRef,
  valueRef,
  widgetConfig,
}: Params): Omit<uPlot.Options, "width" | "height"> => {
  const theme = useContext(ThemeContext)

  const baseAxisConfig: uPlot.Axis = {
    stroke: theme.color.gray2,
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
        let found: string[] = []
        return ticks.map((rawValue, index) => {
          const mapped = mapXValue(rawValue, index, ticks)
          if (mapped === null) {
            return null
          }
          if (found.includes(mapped)) {
            return null
          } else {
            found.push(mapped)
            return mapped
          }
        })
      },
    },
    {
      ...baseAxisConfig,
      values: (_self, ticks) => ticks.map((rawValue) => mapYValue(rawValue)),
    },
  ]

  const series: Record<"x" | "y", uPlot.Series> = {
    x: {},
    y: {
      label: "",
      points: {
        show: data[0].length === 1,
      },
      stroke: colors[0],
      width: 2,
      value: (_self, rawValue) =>
        widgetConfig.distribution !== 3 ? mapYValue(rawValue) : rawValue,
    },
  }

  const scales: uPlot.Scales = {
    x: {
      time: true,
      range: [startTime, endTime],
    },
    y: {
      distr: widgetConfig.distribution,
      range: (u, min, max) => {
        return [
          u.data[0].length > 1 && widgetConfig.distribution !== 3 && min !== max
            ? min
            : widgetConfig.distribution !== 3
            ? 0
            : 1,
          max,
        ]
      },
    },
  }

  return {
    ms: 1,
    padding: [10, 20, 0, 20],

    cursor: {
      sync: {
        key: "metrics",
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

    plugins: [valuePlugin(timeRef, valueRef, mapYValue)],
  }
}
