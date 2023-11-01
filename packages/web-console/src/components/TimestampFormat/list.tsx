import React, { useState } from "react"
import styled from "styled-components"
import type { TimestampFormat } from "../../modules/Import/SchemaEditor/types"
import { DEFAULT_TIMESTAMP_FORMAT } from "../../components/TableSchemaDialog/const"
import { TimestampFormatChip } from "./chip"
import { uuid } from "../../scenes/Import/ImportCSVFiles/utils"

type Props = {}

const Root = styled.ul`
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
`

export const TimestampFormatList = ({}: Props) => {
  //@TODO hook up to API/context
  const [data, setData] = useState<{ [key: React.Key]: TimestampFormat }>({
    [uuid()]: { pattern: DEFAULT_TIMESTAMP_FORMAT },
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
    console.log('onAdd', data)
    setData({
      ...data,
      [uuid()]: { pattern: "" },
    })
  }

  return (
    <Root>
      {Object.entries(data).map(([key, ts]) => (
        <TimestampFormatChip
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
