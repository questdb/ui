import React from "react"
import { Controller, useFormContext } from "react-hook-form"
import { SelectMenuControl } from "../../SelectMenu"

type FormSelectProps = {
  name: string
  options: { label: React.ReactNode; value: string | number }[]
  defaultValue?: string | number
  disabled?: boolean
  menuLabel?: React.ReactNode
}

export const FormSelect = ({
  name,
  options,
  defaultValue,
  disabled,
  menuLabel,
}: FormSelectProps) => {
  const { control, formState, getFieldState } = useFormContext()
  const hasError = getFieldState(name, formState).error != null

  return (
    <Controller
      control={control}
      name={name}
      {...(defaultValue !== undefined && { defaultValue })}
      render={({ field }) => (
        <SelectMenuControl
          id={name}
          name={name}
          value={field.value == null ? "" : String(field.value)}
          options={options.map((option) => ({
            ...option,
            value: String(option.value),
          }))}
          disabled={disabled}
          menuLabel={menuLabel}
          ariaLabel={null}
          ariaInvalid={hasError || undefined}
          ariaDescribedBy={hasError ? `${name}-error` : undefined}
          onOpenChange={(open) => {
            if (!open) field.onBlur()
          }}
          onValueChange={field.onChange}
        />
      )}
    />
  )
}
