import React from "react"
import uPlot from "uplot"
import { utcToLocal } from "../../../utils"
import { Widget } from "./types"
import { DATETIME_FORMAT } from "./utils"
import { DefaultTheme } from "styled-components"

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
  theme: DefaultTheme
}

export type UplotOptions = Omit<uPlot.Options, "width" | "height">

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
        try {
          timeRef.current.textContent = utcToLocal(x as number, DATETIME_FORMAT)
        } catch (e) {
          timeRef.current.textContent = x?.toString() ?? ""
        }
        valueRef.current.textContent = mapYValue(y as number) as string
      } else {
        timeRef.current.textContent = null
        valueRef.current.textContent = null
      }
    },
  },
})

export const createUplotOptions = ({
  data,
  startTime,
  endTime,
  colors,
  mapXValue,
  mapYValue = (rawValue) => (+rawValue).toFixed(4),
  timeRef,
  valueRef,
  widgetConfig,
  theme,
}: Params): UplotOptions => {
  const DISTR_LOG = 3 as uPlot.Scale.Distr
  const baseAxisConfig: uPlot.Axis = {
    stroke: theme.color.gray2,
    labelFont: `600 12px ${theme.font}`,
    font: `14px ${theme.font}`,
    ticks: {
      show: false,
      stroke: theme.color.gray1,
      width: 0.8,
      dash: [],
      size: 10,
    },
    grid: {
      stroke: theme.color.selectionDarker,
    },
  }

  const axes: uPlot.Axis[] = [
    {
      ...baseAxisConfig,
      values: (_self, ticks) => {
        const found: string[] = []
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

  const getFillColor = (strokeColor: string) => {
    // If it's a hex color
    if (strokeColor.startsWith("#")) {
      return `${strokeColor}33` // 33 is 20% opacity in hex
    }

    // If it's rgb
    if (strokeColor.startsWith("rgb")) {
      return strokeColor.replace("rgb", "rgba").replace(")", ", 0.2)")
    }

    return strokeColor
  }

  const series: Record<"x" | "y", uPlot.Series> = {
    x: {},
    y: {
      label: "",
      points: {
        show: data[0].length === 1,
      },
      stroke: colors[0],
      fill: getFillColor(colors[0]),
      width: 0.6,
      value: (_self, rawValue) =>
        widgetConfig.distribution !== DISTR_LOG
          ? mapYValue(rawValue)
          : rawValue,
    },
  }

  const scales: uPlot.Scales = {
    x: {
      time: true,
      range: [startTime, endTime],
    },
    y: {
      distr: widgetConfig.distribution,
      range: (u, min, max) => [
        (u.data[0].length > 1 &&
        widgetConfig.distribution !== DISTR_LOG &&
        min !== max
          ? min
          : widgetConfig.distribution !== DISTR_LOG
            ? 0
            : 1) || 0,
        max || 1,
      ],
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
