import React from "react";
import { useFormContext } from "react-hook-form";
import { Select } from "../../Select";
import type { Props } from "../../Select";

export const FormSelect = ({ name, ...rest }: Props) => {
  const { register } = useFormContext();
  return <Select {...register(name)} {...rest} />;
};
