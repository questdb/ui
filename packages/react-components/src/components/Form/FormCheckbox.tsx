import React from "react";
import { useFormContext } from "react-hook-form";
import { Checkbox } from "../Checkbox";

type Props = React.InputHTMLAttributes<HTMLInputElement> & {
  name: string;
  checked?: boolean;
};

export const FormCheckbox: React.FunctionComponent<Props> = ({
  name,
  checked,
  ...rest
}) => {
  const { register } = useFormContext();

  return (
    <div style={{ width: "100%", display: "flex" }}>
      <Checkbox {...rest} {...register(name)} />
    </div>
  );
};
