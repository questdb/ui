import React from "react";
import type { Props as ButtonProps } from "../../../components/Button";
import { Button } from "../../../components/Button";
import { FormCancelVariant } from "../../../types";
import { useForm, useFormContext } from "react-hook-form";

type Props<TFormValues> = {
  children: React.ReactNode;
  disabled?: boolean;
  variant?: FormCancelVariant;
  prefixIcon?: ButtonProps["prefixIcon"];
  defaultValues?: TFormValues;
};

export const FormCancel = <TFormValues extends Record<string, any>>({
  children,
  disabled,
  variant,
  prefixIcon,
  defaultValues,
}: Props<TFormValues>) => {
  const { reset } = useFormContext();

  return (
    <Button
      type="button"
      onClick={() => reset(defaultValues)}
      disabled={disabled}
      skin={variant ?? "secondary"}
      prefixIcon={prefixIcon}
      dataHook="form-cancel-button"
    >
      {children}
    </Button>
  );
};
