import React, { FC } from "react"
import styled from "styled-components"
import { Table } from "@styled-icons/remix-line"
import { color } from '../../utils'

type TableIconProps = {
  walEnabled?: boolean
  isPartitioned?: boolean
  isMaterializedView?: boolean
}

const WIDTH = "1.4rem"
const HEIGHT = "1.4rem"

const Root = styled.div`
  display: flex;
  align-items: center;
  width: ${WIDTH};
  height: ${HEIGHT};
  position: relative;
  flex-shrink: 0;
  svg {
    color: ${color("cyan")};
  }
`

const Asterisk = styled.span`
  position: absolute;
  top: -0.6rem;
  right: -0.3rem;
  font-size: 1rem;
  line-height: 1.8rem;
  color: ${color("orange")};
`

const NonPartitionedTableIcon = ({ height = "14px", width = "14px" }) => (
  <svg viewBox="0 0 24 24" height={height} width={width} fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 3h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM4 8h16V5H4v3zM4 10h16v9H4v-9z" fillRule="evenodd" clipRule="evenodd"/>
  </svg>
)

export const MaterializedViewIcon = ({ height = "14px", width = "14px" }) => (
  <svg
    viewBox="0 0 28 28"
    height={height}
    width={width}
    xmlns="http://www.w3.org/2000/svg"
  >
    <g stroke="currentColor" strokeWidth="2" fill="none" transform="translate(-2, -2)">
      <line x1="3" y1="4" x2="22" y2="4" />
      <line x1="4" y1="4" x2="4" y2="22" />
      <line x1="21" y1="4" x2="21" y2="11" />
      <line x1="4" y1="21" x2="11" y2="21" />
    </g>
    <g transform="translate(6,6)" fill="currentColor">
      <path fill="none" d="M0 0h24v24H0z" />
      <path d="M4 8h16V5H4v3zm10 11v-9h-4v9h4zm2 0h4v-9h-4v9zm-8 0v-9H4v9h4zM3 3h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
    </g>
  </svg>
)

export const TableIcon: FC<TableIconProps> = ({ walEnabled, isPartitioned, isMaterializedView }) => (
  <Root>
    {isMaterializedView ? (
      <MaterializedViewIcon height="14px" width="14px" />
    ) : (
      <>
        {!walEnabled && <Asterisk>*</Asterisk>}
        {isPartitioned ? <Table size="14px" /> : <NonPartitionedTableIcon height="14px" />}
      </>
    )}
  </Root>
)
