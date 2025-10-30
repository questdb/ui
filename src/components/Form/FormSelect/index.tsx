import React from "react"
import { useFormContext } from "react-hook-form"
import { Select } from "../../Select"
import type { SelectProps } from "../../Select"

export const FormSelect = ({ name, ...rest }: SelectProps) => {
  const { register } = useFormContext()
  return <Select {...register(name)} {...rest} />
}
