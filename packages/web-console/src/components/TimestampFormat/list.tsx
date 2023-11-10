import React from "react"
import styled from "styled-components"
import { TimestampFormatChip } from "./chip"
import { useFieldArray } from "react-hook-form"

type Props = Pick<
  ReturnType<typeof useFieldArray>,
  "fields" | "remove" | "update"
>

const Root = styled.ul`
  padding: unset;
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
`

export const TimestampFormatList = ({ fields, remove, update }: Props) => {
  const onChipClose = (index: number) => {
    remove(index)
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
    </Root>
  )
}
