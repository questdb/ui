import React, { useEffect } from "react"
import { useFormContext } from "react-hook-form"
import { TextArea } from "../../TextArea"

type TextAreaProps = {
  rows?: number
  name: string
  placeholder?: string
  autoFocus?: boolean
}

export const FormTextArea = ({
  name,
  placeholder,
  rows,
  autoFocus,
  ...rest
}: TextAreaProps) => {
  const { formState, getFieldState, register, setFocus } = useFormContext()
  const hasError = getFieldState(name, formState).error != null

  useEffect(() => {
    if (autoFocus) {
      setFocus(name)
    }
  }, [])

  return (
    <TextArea
      {...register(name)}
      rows={rows ?? 4}
      placeholder={placeholder}
      {...rest}
      id={name}
      aria-invalid={hasError || undefined}
      aria-describedby={hasError ? `${name}-error` : undefined}
    />
  )
}
