import React from "react"
import { SelectMenuControl } from "../../../../../components"
import type { ListVariable } from "../../../../../store/notebook"
import { CheckboxField, Field, FieldRow, Fields, MonoInput } from "./Field"

const ALL_MODE_OPTIONS = [
  {
    value: "list",
    label: "Option list",
    description: 'Selecting "all" option inserts every value in the list.',
  },
  {
    value: "custom",
    label: "Custom value",
    description: 'Selecting "all" option inserts one value of your choice.',
  },
]

type Props = {
  variable: ListVariable
  onChange: (variable: ListVariable) => void
}

export const SelectionOptions = ({ variable, onChange }: Props) => {
  const setMulti = (multi: boolean) =>
    onChange({
      ...variable,
      multi,
      selected:
        !multi && Array.isArray(variable.selected)
          ? variable.selected.slice(0, 1)
          : variable.selected,
    })

  const setIncludeAll = (includeAll: boolean) =>
    onChange({
      ...variable,
      includeAll,
      selected:
        !includeAll && variable.selected === "all" ? [] : variable.selected,
    })

  const setAllMode = (mode: string) =>
    onChange({
      ...variable,
      all:
        mode === "custom"
          ? {
              mode: "custom",
              value: variable.all.mode === "custom" ? variable.all.value : "",
            }
          : { mode: "list" },
    })

  return (
    <Fields>
      <CheckboxField
        label="Multi-value"
        hint="Several values can be picked at once. Use IN @name in queries."
        checked={variable.multi}
        onChange={setMulti}
        dataHook="variable-multi"
      />
      <CheckboxField
        label="Include All option"
        hint="Adds an All choice that selects every value."
        checked={variable.includeAll}
        onChange={setIncludeAll}
        dataHook="variable-include-all"
      />
      {variable.includeAll && (
        <FieldRow>
          <Field label="All value">
            <SelectMenuControl
              labelFontSize="1.4rem"
              name="all-mode"
              dataHook="variable-all-mode"
              value={variable.all.mode}
              options={ALL_MODE_OPTIONS.map((option) => ({
                ...option,
                dataHook: `variable-all-mode-${option.value}`,
              }))}
              onValueChange={setAllMode}
            />
          </Field>
          {variable.all.mode === "custom" && (
            <Field label="Custom value">
              <MonoInput
                aria-label="Custom value"
                value={variable.all.value}
                data-hook="variable-all-value"
                placeholder="'.*'"
                autoComplete="off"
                spellCheck={false}
                onChange={(e) =>
                  onChange({
                    ...variable,
                    all: { mode: "custom", value: e.target.value },
                  })
                }
              />
            </Field>
          )}
        </FieldRow>
      )}
    </Fields>
  )
}
