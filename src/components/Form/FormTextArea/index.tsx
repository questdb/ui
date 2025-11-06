import React, { useEffect } from "react"
import styled from "styled-components"
import { Input as UnstyledInput } from "@questdb/react-components"
import { useFormContext } from "react-hook-form"

const TextArea = styled(UnstyledInput).attrs({
  as: "textarea",
})<React.TextareaHTMLAttributes<HTMLTextAreaElement>>`
  width: 100%;
  height: inherit;
`

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
  const { register, setFocus } = useFormContext()

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
    />
  )
}
