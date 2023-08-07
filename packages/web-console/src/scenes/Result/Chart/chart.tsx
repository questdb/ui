import React from "react"
import styled from "styled-components"
import { useSelector } from "react-redux"
import { selectors } from "../../../store"
import { GraphSettings } from "./graph-settings"
import { Graph } from "./graph"

const Root = styled.div`
  display: flex;
  width: 100%;
  height: 100%;
  padding: 2rem;
`

export const Chart = () => {
  const result = useSelector(selectors.query.getResult)

  console.log(result)

  return (
    <Root>
      <GraphSettings />
      <Graph />
    </Root>
  )
}
