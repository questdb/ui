import React, { useState } from "react"
import styled from "styled-components"
import type { TimestampFormat } from "../../modules/Import/SchemaEditor/types"
import { DEFAULT_TIMESTAMP_FORMAT } from "../../components/TableSchemaDialog/const"
import { TimestampFormatChip } from "./chip"
import { uuid } from "../../scenes/Import/ImportCSVFiles/utils"
import { useFieldArray, useFormContext } from "react-hook-form"

type Props = {}

const Root = styled.ul`
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
`

export const TimestampFormatList = ({}: Props) => {
  const { fields, append, remove, update } = useFieldArray({
    name: "formats.patterns",
  })

  const onChipClose = (index: number) => {
    remove(index)
  }

  const onAdd = () => {
    append({ pattern: "" })
  }

  return (
    <Root>
      {fields.map((field, index) => (
        <TimestampFormatChip
          key={field.id}
          fieldID={`formats.patterns.${index}.pattern`}
          index={index}
          onClose={onChipClose}
          onSave={update}
        />
      ))}
      <button type="button" onClick={onAdd}>
        +
      </button>
    </Root>
  )
}
