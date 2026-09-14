import React from "react"
import type { TextVariable } from "../../../../../store/notebook"
import { Field, MonoInput } from "./Field"

type Props = {
  variable: TextVariable
  onChange: (variable: TextVariable) => void
}

export const TextForm = ({ variable, onChange }: Props) => (
  <Field label="Default value">
    <MonoInput
      value={variable.value}
      autoComplete="off"
      spellCheck={false}
      onChange={(e) => onChange({ ...variable, value: e.target.value })}
      data-hook="variable-text-value"
    />
  </Field>
)
