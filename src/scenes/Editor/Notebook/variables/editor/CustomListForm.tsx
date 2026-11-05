import React from "react"
import { SqlInput } from "../../../../../components/SqlInput"
import type { ListVariable } from "../../../../../store/notebook"
import { customListOptions } from "../listOptions"
import { Field, Fields } from "./Field"
import { OptionsPreview } from "./OptionsPreview"
import { SelectionOptions } from "./SelectionOptions"

type Props = {
  variable: ListVariable & { source: { type: "custom" } }
  invalid: boolean
  onChange: (variable: ListVariable) => void
}

export const CustomListForm = ({ variable, invalid, onChange }: Props) => (
  <Fields>
    <Field
      label="Values"
      required
      hint='Comma-separated list of options. Use "AS" for showing a different name for the value.'
    >
      <SqlInput
        value={variable.source.entries}
        invalid={invalid}
        placeholder="'EURUSD', 'GBPUSD' as Pound, 'USDJPY'"
        minLines={3}
        ariaLabel="Values"
        dataHook="variable-custom-entries"
        onChange={(entries) =>
          onChange({ ...variable, source: { ...variable.source, entries } })
        }
      />
    </Field>
    <SelectionOptions variable={variable} onChange={onChange} />
    <Fields>
      <OptionsPreview options={customListOptions(variable)} />
    </Fields>
  </Fields>
)
