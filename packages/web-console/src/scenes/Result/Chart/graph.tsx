import React, { useEffect, useRef, useState } from "react"
import UplotReact from "uplot-react"
import styled from "styled-components"
import * as QuestDB from "../../../utils/questdb"

import "uplot/dist/uPlot.min.css"
import type { ChartConfig } from "./types"
import { useGraphOptions } from "./useGraphOptions"
import { ColumnDefinition } from "utils"

const Root = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  width: 96rem;
  height: 25rem;
`

const GraphRoot = styled(Root)``

type Props = {
  columns: ColumnDefinition[]
  chartConfig: ChartConfig
  dataset: QuestDB.DatasetType[]
}

export const Graph = ({ columns, chartConfig, dataset }: Props) => {
  const [layoutReady, setLayoutReady] = useState(false)
  const plotRef = useRef(null)
  const graphOptions = useGraphOptions({ columns, chartConfig })

  const columnMap = new Map()
  for (let i = 0; i < columns.length; i++) {
    columnMap.set(columns[i].name, i)
  }

  const xSeries: any[] = dataset.map(
    (item) => item[columnMap.get(chartConfig.label)],
  )

  useEffect(() => {
    setLayoutReady(true)
  }, [])

  console.log([
    [...xSeries],
    [...Array.from(new Array(1000)).map((_i, k) => k + 1)],
  ])

  return (
    <Root>
      {layoutReady && plotRef.current && (
        <UplotReact
          options={graphOptions}
          data={[
            [...xSeries],
            [...Array.from(new Array(1000)).map((_i, k) => k + 1)],
          ]}
          target={plotRef.current}
        />
      )}
      <GraphRoot ref={plotRef} />
    </Root>
  )
}
