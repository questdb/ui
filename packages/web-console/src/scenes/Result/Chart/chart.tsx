import React, { useEffect, useState } from "react"
import styled from "styled-components"
import { useSelector } from "react-redux"
import { selectors } from "../../../store"
import { GraphSettings } from "./graph-settings"
import { Graph } from "./graph"
import { match, P } from "ts-pattern"
import * as QuestDB from "../../../utils/questdb"
import { Box, Button, Heading } from "@questdb/react-components"
import { Book } from "styled-icons/remix-line"
import type { ChartConfig } from "./types"

const Root = styled(Box).attrs({ justifyContent: "center" })`
  width: 100%;
  height: 100%;
  padding: 2rem;
`

const GraphWrapper = styled(Box).attrs({ gap: "2rem" })``

const ZeroState = () => (
  <Box gap="2rem" flexDirection="column" align="center">
    <img
      alt="Database icon"
      width="60"
      height="80"
      src="/assets/database.svg"
    />
    <Heading level={3}>Query data with SELECT to use the chart</Heading>
    <a
      href="https://questdb.io/docs/reference/sql/select/"
      target="_blank"
      rel="noopener noreferre"
    >
      <Button skin="secondary" prefixIcon={<Book size="18" />}>
        Explore docs
      </Button>
    </a>
  </Box>
)

export const Chart = () => {
  const result = useSelector(selectors.query.getResult)
  const [chartConfig, setChartConfig] = useState<ChartConfig>({
    type: "line",
    series: [],
    label: "",
  })

  useEffect(() => {
    if (result?.type === QuestDB.Type.DQL) {
      setChartConfig({
        ...chartConfig,
        label: result.columns[0].name,
      })
    }
  }, [result])

  return (
    <Root>
      {result && result?.type === QuestDB.Type.DQL ? (
        <GraphWrapper>
          <GraphSettings
            columns={result.columns}
            chartConfig={chartConfig}
            onChartConfigChange={setChartConfig}
          />
          <Graph
            columns={result.columns}
            chartConfig={chartConfig}
            dataset={result.dataset}
          />
        </GraphWrapper>
      ) : (
        <ZeroState />
      )}
    </Root>
  )
}
