import React from "react"
import { useFormContext } from "react-hook-form"
import { Select } from "@questdb/react-components"
import type { Props } from "@questdb/react-components/dist/components/Select"

export const FormSelect = ({ name, ...rest }: Props) => {
  const { register } = useFormContext()
  return <Select {...register(name)} {...rest} />
}
