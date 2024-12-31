import { utcToLocal } from "./../../../utils/dateTime"
import { useContext } from "react"
import { ThemeContext } from "styled-components"
import uPlot from "uplot"
import { durationTokenToDate, DATETIME_FORMAT } from "./utils"

type Params = {
  data: uPlot.AlignedData
  startTime: number
  endTime: number
  colors: string[]
  tickValue?: (rawValue: number) => string
  mapXValue: (rawValue: number, index: number, ticks: number[]) => string
  mapYValue: (rawValue: number) => string
  timeRef: React.RefObject<HTMLSpanElement>
  valueRef: React.RefObject<HTMLSpanElement>
}

const valuePlugin = (
  timeRef: React.RefObject<HTMLSpanElement>,
  valueRef: React.RefObject<HTMLSpanElement>,
  mapYValue: (rawValue: number) => string,
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
        valueRef.current!.textContent = mapYValue(y as number)
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
      value: (_self, rawValue) => mapYValue(rawValue),
    },
  }

  const scales: uPlot.Scales = {
    x: {
      time: true,
      range: [startTime, endTime],
    },
    y: {
      range: (u, min, max) => {
        return [u.data[0].length > 1 && min !== max ? min : 0, max]
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
