import React, { useState } from "react"
import styled from "styled-components"
import type { Timestamp } from "../types"
import { DEFAULT_TIMESTAMP_FORMAT } from "../../TableSchemaDialog/const"
import { TimestampChip } from "./chip"
import { uuid } from "../../../scenes/Import/ImportCSVFiles/utils"

type Props = {}

const Root = styled.ul`
  display: flex;
  gap: 2rem;
  flex-wrap: wrap;
`

export const TimestampList = ({}: Props) => {
  //@TODO hook up to API/context
  const [data, setData] = useState<{ [key: React.Key]: Timestamp }>({
    [uuid()]: { pattern: DEFAULT_TIMESTAMP_FORMAT, supplier: "client" },
  })

  const onChipClose = (key: React.Key) => {
    const newData = Object.assign({}, data)
    delete newData[key]
    setData(newData)
  }

  const onChipEdit = (key: React.Key, value: string) => {
    const newData = Object.assign({}, data)
    newData[key].pattern = value
    setData(newData)
  }

  const onAdd = () => {
    setData({
      ...data,
      [uuid()]: { pattern: DEFAULT_TIMESTAMP_FORMAT, supplier: "client" },
    })
  }

  

  return (
    <Root>
      {Object.entries(data).map(([key, ts]) => (
        <TimestampChip
          key={key}
          id={key}
          data={ts}
          onClose={() => onChipClose(key)}
          onSave={onChipEdit}
        />
      ))}
      <button onClick={onAdd}>+</button>
    </Root>
  )
}
