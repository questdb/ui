import React, { FC } from "react"
import styled from "styled-components"
import { Table } from "@styled-icons/remix-line"
import { PopperHover } from "../../components/PopperHover"
import { Tooltip } from "../../components/Tooltip"
import { color } from "../../utils"
import * as QuestDB from "../../utils/questdb"

type TableIconProps = {
  walEnabled?: boolean
  partitionBy?: QuestDB.PartitionBy
  designatedTimestamp?: string
  isMaterializedView?: boolean
  size?: string
}

const DEFAULT_SIZE = "14px"

const Root = styled.div<{ $size: string }>`
  display: flex;
  align-items: center;
  width: ${({ $size }) => $size};
  height: ${({ $size }) => $size};
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

const NonPartitionedTableIcon = ({
  size = DEFAULT_SIZE,
}: {
  size?: string
}) => (
  <svg
    viewBox="0 0 24 24"
    height={size}
    width={size}
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

export const MaterializedViewIcon = ({
  size = DEFAULT_SIZE,
}: {
  size?: string
}) => (
  <svg
    viewBox="0 0 28 28"
    height={size}
    width={size}
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

export const TableIcon: FC<TableIconProps> = ({
  walEnabled,
  partitionBy,
  designatedTimestamp,
  isMaterializedView,
  size = DEFAULT_SIZE,
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

  if (isMaterializedView) {
    return (
      <PopperHover
        trigger={
          <Root $size={size} data-hook="table-icon">
            <MaterializedViewIcon size={size} />
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
        <Root $size={size} data-hook="table-icon">
          {!walEnabled && <Asterisk>*</Asterisk>}
          {isPartitioned ? (
            <Table size={size} />
          ) : (
            <NonPartitionedTableIcon size={size} />
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
