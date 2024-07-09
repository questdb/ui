import React from "react"
import styled from "styled-components"
import * as QuestDB from "../../utils/questdb"

type Props = {
  partitionBy?: QuestDB.PartitionBy
  walEnabled?: boolean
  suspended?: boolean
}

const Root = styled.div<{ $suspended?: boolean }>`
  display: flex;
  align-items: center;
  width: 1.8rem;
  height: 1.5rem;
  position: relative;
  color: ${({ theme, $suspended }) =>
    theme.color[$suspended ? "red" : "gray2"]};
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

const AsteriskSVG = styled.svg`
  position: absolute;
  top: -4px;
  right: -8px;
`

const RED = "#ff5555"
const GRAY2 = "#bbbbbb"

export const TableIcon = ({ partitionBy, walEnabled, suspended }: Props) => {
  const isPartitioned = partitionBy && partitionBy !== "NONE"
  return (
    <Root $suspended={suspended}>
      {!walEnabled && (
        <AsteriskSVG
          width="8"
          height="7"
          viewBox="0 0 8 7"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M4.74512 0.363281L4.47168 2.97461L7.09668 2.22949L7.30176 3.68555L4.84766 3.9043L6.44043 6.03027L5.11426 6.74805L3.95898 4.45801L2.92676 6.74121L1.5459 6.03027L3.125 3.9043L0.68457 3.67871L0.916992 2.22949L3.49414 2.97461L3.2207 0.363281H4.74512Z"
            fill="#F1FA8C"
          />
        </AsteriskSVG>
      )}
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
          stroke={suspended ? RED : GRAY2}
        />
        {!isPartitioned && (
          <>
            <path d="M1 5H17" stroke={GRAY2} />
            <path d="M6 5L6 15" stroke={GRAY2} />
            <path d="M6 5L6 15" stroke={GRAY2} />
            <path d="M12 5V15" stroke={GRAY2} />
            <path d="M12 5V15" stroke={GRAY2} />
          </>
        )}
      </IconSVG>
      {isPartitioned && (
        <PartitionLetter>{partitionBy.substr(0, 1)}</PartitionLetter>
      )}
    </Root>
  )
}
