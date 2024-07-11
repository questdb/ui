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

const Root = styled.div<{ $suspended?: boolean }>`
  display: flex;
  align-items: center;
  width: 1.8rem;
  height: 1.5rem;
  position: relative;
  color: ${({ $suspended }) => ($suspended ? RED : WHITE)};
  margin-right: 1rem;
`

const PartitionLetter = styled.span`
  width: 100%;
  text-align: center;
  font-size: 1rem;
`

const IconSVG = styled.svg`
  position: absolute;
`

const Asterisk = styled.span`
  position: absolute;
  top: -8px;
  right: -8px;
  font-size: 1.4rem;
  line-height: 1.4rem;
  color: #f1fa8c;
`

export const TableIcon = ({ partitionBy, walEnabled, suspended }: Props) => {
  const isPartitioned = partitionBy && partitionBy !== "NONE"
  return (
    <Root $suspended={suspended}>
      {!walEnabled && <Asterisk>*</Asterisk>}
      <IconSVG
        width="18"
        height="15"
        viewBox="0 0 18 15"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect
          x="0.5"
          y="0.5"
          width="17"
          height="14"
          rx="1.5"
          stroke={suspended ? RED : WHITE}
        />
        {!isPartitioned && (
          <>
            <path d="M1 5H17" stroke={WHITE} />
            <path d="M6 5L6 15" stroke={WHITE} />
            <path d="M6 5L6 15" stroke={WHITE} />
            <path d="M12 5V15" stroke={WHITE} />
            <path d="M12 5V15" stroke={WHITE} />
          </>
        )}
      </IconSVG>
      {isPartitioned && (
        <PartitionLetter>{partitionBy.substr(0, 1)}</PartitionLetter>
      )}
    </Root>
  )
}
