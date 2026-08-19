import React from "react"
import { useFormContext } from "react-hook-form"
import { Checkbox } from "../../components"

type Props = React.InputHTMLAttributes<HTMLInputElement> & {
  name: string
  checked?: boolean
}

export const FormCheckbox: React.FunctionComponent<Props> = ({
  name,
  ...rest
}) => {
  const { formState, getFieldState, register } = useFormContext()
  const hasError = getFieldState(name, formState).error != null

  return (
    <div style={{ width: "100%", display: "flex" }}>
      <Checkbox
        {...rest}
        {...register(name)}
        id={name}
        aria-invalid={hasError || undefined}
        aria-describedby={hasError ? `${name}-error` : undefined}
      />
    </div>
  )
}
