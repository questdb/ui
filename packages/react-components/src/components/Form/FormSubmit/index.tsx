import React from "react";
import type { Props as ButtonProps } from "../../../components/Button";
import { Button } from "../../../components/Button";

type Props = {
  children: React.ReactNode;
  disabled?: boolean;
  variant?: "error" | "success" | "warning" | "primary";
  prefixIcon?: ButtonProps["prefixIcon"];
};

export const FormSubmit = ({
  children,
  disabled,
  variant,
  prefixIcon,
}: Props) => (
  <Button
    type="submit"
    disabled={disabled}
    skin={variant ?? "primary"}
    prefixIcon={prefixIcon}
    dataHook="form-submit-button"
  >
    {children}
  </Button>
);
