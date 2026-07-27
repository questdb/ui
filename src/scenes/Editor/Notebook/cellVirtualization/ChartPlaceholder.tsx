import React from "react"
import styled from "styled-components"
import { ShimmerBar, ShimmerSweep } from "./ShimmerBar"

const Wrapper = styled.div`
  content-visibility: auto;
  position: relative;
  display: flex;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: ${({ theme }) => theme.color.backgroundLighter};
`

const ChartShimmerRect = styled(ShimmerBar)`
  flex: 1;
  margin: 12px;
`

export const ChartPlaceholder = () => (
  <Wrapper data-hook="cell-chart-placeholder" aria-hidden="true">
    <ChartShimmerRect />
    <ShimmerSweep />
  </Wrapper>
)
