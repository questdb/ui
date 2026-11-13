import React, { useState } from "react"
import styled from "styled-components"
import { Input } from "../../../../../components"
import type { TextVariable } from "../../../../../store/notebook"
import { PickerLabel } from "./PickerLabel"

const PickerInput = styled(Input)`
  width: 16rem;
  font-family: ${({ theme }) => theme.fontMonospace};
`

type Props = {
  variable: TextVariable
  onChange: (value: string) => void
}

export const TextPicker = ({ variable, onChange }: Props) => {
  const [draft, setDraft] = useState({
    base: variable.value,
    text: variable.value,
  })
  const inputId = `variable-text-${variable.name}`
  const text = draft.base === variable.value ? draft.text : variable.value

  const edit = (next: string) => setDraft({ base: variable.value, text: next })

  const commit = () => {
    if (text !== variable.value) onChange(text)
  }

  return (
    <>
      <PickerLabel variable={variable} htmlFor={inputId} />
      <PickerInput
        id={inputId}
        value={text}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => edit(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            commit()
          }
        }}
        data-hook={inputId}
      />
    </>
  )
}
