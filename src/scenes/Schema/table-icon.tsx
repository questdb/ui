import React, { FC } from "react"
import styled from "styled-components"
import { Table } from "@styled-icons/remix-line"
import { PopperHover } from "../../components/PopperHover"
import { Tooltip } from "../../components/Tooltip"
import { color } from "../../utils"
import * as QuestDB from "../../utils/questdb"

type TableIconProps = {
  kind: "table" | "matview" | "view"
  walEnabled?: boolean
  partitionBy?: QuestDB.PartitionBy
  designatedTimestamp?: string
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
  <svg
    viewBox="0 0 24 24"
    height={height}
    width={width}
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M3 3h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM4 8h16V5H4v3zM4 10h16v9H4v-9z"
      fillRule="evenodd"
      clipRule="evenodd"
    />
  </svg>
)

export const MaterializedViewIcon = ({ height = "14px", width = "14px" }) => (
  <svg
    viewBox="0 0 28 28"
    height={height}
    width={width}
    xmlns="http://www.w3.org/2000/svg"
  >
    <g
      stroke="currentColor"
      strokeWidth="2"
      fill="none"
      transform="translate(-2, -2)"
    >
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

export const ViewIcon = ({ height = "14px", width = "14px" }) => (
  <svg
    viewBox="0 0 24 24"
    height={height}
    width={width}
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M12 3c5.392 0 9.878 3.88 10.819 9-.94 5.12-5.427 9-10.819 9-5.392 0-9.878-3.88-10.819-9C2.121 6.88 6.608 3 12 3zm0 16a9.005 9.005 0 0 0 8.777-7 9.005 9.005 0 0 0-17.554 0A9.005 9.005 0 0 0 12 19zm0-2.5a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9zm0-2a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" />
  </svg>
)

export const TableIcon: FC<TableIconProps> = ({
  kind,
  walEnabled,
  partitionBy,
  designatedTimestamp,
}) => {
  const isPartitioned = partitionBy && partitionBy !== "NONE"
  const partitionText = isPartitioned
    ? `Partitioned by "${partitionBy.toLowerCase()}"`
    : "Unpartitioned"
  const timestampText = designatedTimestamp
    ? `ordered on "${designatedTimestamp}" column`
    : "unordered"
  const walText = walEnabled ? "WAL-based table" : "Legacy table format"
  const fullHeader = `${walText}. ${partitionText}, ${timestampText}.`
  const description = walEnabled
    ? "WAL-based tables are the current and most up-to-date table format. This format supports advanced data recovery, replication and high-throughput ingestion. This is the recommended format if your table contains time-series data that has a designated timestamp."
    : "Legacy table format, without WAL (write-ahead-log). This table format should only be used when table does not have timestamp column and generally not a time series. These tables are not replicated and could be slower to ingress data into."

  if (kind === "view") {
    return <ViewIcon height="14px" width="14px" />
  }

  if (kind === "matview") {
    return (
      <PopperHover
        trigger={
          <Root data-hook="table-icon">
            <MaterializedViewIcon height="14px" width="14px" />
          </Root>
        }
        delay={1000}
        placement="bottom"
      >
        <Tooltip>
          {partitionText}, {timestampText}.
        </Tooltip>
      </PopperHover>
    )
  }

  return (
    <PopperHover
      trigger={
        <Root data-hook="table-icon">
          {!walEnabled && <Asterisk>*</Asterisk>}
          {isPartitioned ? (
            <Table size="14px" />
          ) : (
            <NonPartitionedTableIcon height="14px" />
          )}
        </Root>
      }
      delay={1000}
      placement="bottom"
    >
      <Tooltip>
        {fullHeader}
        <br />
        <br />
        {description}
      </Tooltip>
    </PopperHover>
  )
}
