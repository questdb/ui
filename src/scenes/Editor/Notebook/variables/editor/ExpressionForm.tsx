import React from "react"
import type { ExpressionVariable } from "../../../../../store/notebook"
import { Field, MonoInput } from "./Field"

type Props = {
  variable: ExpressionVariable
  invalid: boolean
  onChange: (variable: ExpressionVariable) => void
}

export const ExpressionForm = ({ variable, invalid, onChange }: Props) => (
  <Field label="Value" required>
    <MonoInput
      aria-label="Value"
      value={variable.value}
      autoComplete="off"
      spellCheck={false}
      variant={invalid ? "error" : undefined}
      onChange={(e) => onChange({ ...variable, value: e.target.value })}
      data-hook="variable-expression-value"
    />
  </Field>
)
