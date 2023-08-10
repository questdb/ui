import { useContext } from "react"
import { ThemeContext } from "styled-components"
import * as QuestDB from "../../../utils/questdb"
import { ChartConfig } from "./types"
import { ColumnDefinition } from "utils"

type Props = {
  columns: ColumnDefinition[]
  chartConfig: ChartConfig
}

export const useGraphOptions = ({ columns, chartConfig }: Props) => {
  const themeContext = useContext(ThemeContext)

  const axisConfig = {
    stroke: themeContext.color.graphLegend,
    labelFont: `600 12px ${themeContext.font}`,
    font: `12px ${themeContext.font}`,
    ticks: {
      show: true,
      stroke: themeContext.color.gray1,
      width: 2,
      dash: [],
      size: 5,
    },
    grid: {
      stroke: themeContext.color.selectionDarker,
    },
  }

  return {
    width: 920,
    height: 180,
    padding: [10, 20, 0, 10],

    axes: [
      {
        ...axisConfig,
      },
      // duplicate as many times as chartConfig.series length
      {
        ...axisConfig,
      },
    ],

    series: [
      {},
      // duplicate as many times as chartConfig.series length, with different colors and add series name
      {
        label: "",
        points: {
          show: true,
        },
        stroke: themeContext.color.cyan,
        width: 2,
      },
    ],

    scales: {
      x: {
        time: false,
      },
      // add y scale
    },

    legend: {
      show: false,
      markers: {
        show: false,
      },
    },
  }
}
