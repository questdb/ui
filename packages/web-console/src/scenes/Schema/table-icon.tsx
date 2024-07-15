import React from "react"
import styled from "styled-components"
import * as QuestDB from "../../utils/questdb"

type Props = {
  partitionBy?: QuestDB.PartitionBy
  walEnabled?: boolean
  suspended?: boolean
}

const RED = "#ff5555"
const WHITE = "#f8f8f2"

const WIDTH = "2.2rem"
const HEIGHT = "1.8rem"

const Root = styled.div<{ $suspended?: boolean }>`
  display: flex;
  align-items: center;
  width: ${WIDTH};
  height: ${HEIGHT};
  position: relative;
  color: ${({ $suspended }) => ($suspended ? RED : WHITE)};
  margin-right: 1rem;
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
  border: 1px ${({ $suspended }) => ($suspended ? RED : WHITE)} solid;
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

export const TableIcon = ({ partitionBy, walEnabled, suspended }: Props) => {
  const isPartitioned = partitionBy && partitionBy !== "NONE"
  return (
    <Root $suspended={suspended}>
      {!walEnabled && <Asterisk>*</Asterisk>}
      <Icon $suspended={suspended}>
        {!isPartitioned && (
          <>
            <HLine />
            <VLine1 />
            <VLine2 />
          </>
        )}
      </Icon>
      {isPartitioned && (
        <PartitionLetter>{partitionBy.substr(0, 1)}</PartitionLetter>
      )}
    </Root>
  )
}
