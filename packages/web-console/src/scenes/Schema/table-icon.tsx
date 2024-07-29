import { IconWithTooltip } from "../../components"
import React from "react"
import styled from "styled-components"
import * as QuestDB from "../../utils/questdb"
import { Table } from "@styled-icons/remix-line"
import { Error } from "@styled-icons/boxicons-regular"
import { Box } from "@questdb/react-components"

type Props = {
  partitionBy?: QuestDB.PartitionBy
  walEnabled?: boolean
  suspended?: boolean
}

const WIDTH = "2.2rem"
const HEIGHT = "1.8rem"

const Root = styled.div<{ $suspended?: boolean }>`
  display: flex;
  align-items: center;
  width: ${WIDTH};
  height: ${HEIGHT};
  position: relative;
  color: ${({ $suspended, theme }) =>
    theme.color[$suspended ? "orange" : "white"]};
  margin-right: 1rem;
  flex-shrink: 0;
`

const PartitionLetter = styled.span`
  width: 100%;
  height: 100%;
  text-align: center;
  font-size: 1.4rem;
  line-height: ${HEIGHT};
`

const Icon = styled.div<{ $suspended?: boolean }>`
  position: absolute;
  width: ${WIDTH};
  height: ${HEIGHT};
  border: 1px
    ${({ $suspended, theme }) => theme.color[$suspended ? "orange" : "white"]}
    solid;
  border-radius: 2px;
`

const Asterisk = styled.span`
  position: absolute;
  top: -9px;
  right: -0.5rem;
  font-size: 1.8rem;
  line-height: 1.8rem;
  color: #f1fa8c;
`

const HLine = styled.div`
  position: absolute;
  width: 100%;
  height: 0.1rem;
  background: WHITE;
  top: 0.4rem;
`

const VLine = styled.div`
  position: absolute;
  width: 0.1rem;
  height: calc(${HEIGHT} - 0.5rem);
  background: WHITE;
  top: 0.4rem;
`

const VLine1 = styled(VLine)`
  left: 0.6rem;
`

const VLine2 = styled(VLine)`
  left: 1.3rem;
`

const ErrorIcon = styled(Error)`
  position: absolute;
  top: 0;
  left: 2px;
`

const IconComponent = ({
  isPartitioned,
  partitionBy,
  walEnabled,
  suspended,
}: Props & { isPartitioned: boolean }) =>
  suspended ? (
    <Root $suspended={true}>
      <Icon $suspended={true}>
        <ErrorIcon size="16px" />
      </Icon>
    </Root>
  ) : (
    <Root>
      {!walEnabled && <Asterisk>*</Asterisk>}
      <Icon>
        {!isPartitioned && (
          <>
            <HLine />
            <VLine1 />
            <VLine2 />
          </>
        )}
      </Icon>
      {isPartitioned && partitionBy && (
        <PartitionLetter>{partitionBy.substr(0, 1)}</PartitionLetter>
      )}
    </Root>
  )

export const TableIcon = ({ partitionBy, walEnabled, suspended }: Props) => {
  const isPartitioned = (partitionBy && partitionBy !== "NONE") || false
  let tooltipLines = []
  if (isPartitioned && partitionBy) {
    tooltipLines.push(
      `${partitionBy.substr(0, 1)}: Partitioned by ${partitionBy}`,
    )
  } else {
    tooltipLines.push(
      <Box align="center" gap="0">
        <Table size="14px" />
        <span>: Not partitioned</span>
      </Box>,
    )
  }

  if (!walEnabled) {
    tooltipLines.push("*: non-WAL (Legacy)")
  }

  return isPartitioned || !walEnabled ? (
    <IconWithTooltip
      icon={
        <span>
          <IconComponent
            isPartitioned={isPartitioned}
            partitionBy={partitionBy}
            walEnabled={walEnabled}
            suspended={suspended}
          />
        </span>
      }
      tooltip={tooltipLines.map((line, i) => (
        <div key={i}>{line}</div>
      ))}
      placement="bottom"
    />
  ) : (
    <IconComponent
      isPartitioned={isPartitioned}
      partitionBy={partitionBy}
      walEnabled={walEnabled}
      suspended={suspended}
    />
  )
}
