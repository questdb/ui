import React, { useEffect, useRef, useState } from "react"
import UplotReact from "uplot-react"
import * as QuestDB from "../../../utils/questdb"

import "uplot/dist/uPlot.min.css"
import type { ChartConfig } from "./types"

type Props = {
  chartConfig: ChartConfig
  dataset: QuestDB.DatasetType[]
}

export const Graph = ({ chartConfig, dataset }: Props) => {
  const [layoutReady, setLayoutReady] = useState(false)
  const plotRef = useRef(null)

  console.log(dataset)

  useEffect(() => {
    setLayoutReady(true)
  }, [])

  return <div>graph</div>
}
