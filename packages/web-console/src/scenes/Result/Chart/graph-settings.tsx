import React from "react"
import { ColumnDefinition } from "utils"
import type { ChartConfig } from "./types"

type Props = {
  columns: ColumnDefinition[]
  chartConfig: ChartConfig
  onChartConfigChange: (chartConfig: ChartConfig) => void
}

export const GraphSettings = ({
  columns,
  chartConfig,
  onChartConfigChange,
}: Props) => {
  console.log(columns)
  return <div>Graph settings</div>
}
