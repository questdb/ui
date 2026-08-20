import React from "react"
import type { ButtonProps } from "../../Button"
import { Button } from "../../Button"

type Props = {
  children: React.ReactNode
  disabled?: boolean
  variant?: ButtonProps["variant"]
  prefixIcon?: ButtonProps["prefixIcon"]
}

export const FormSubmit = ({
  children,
  disabled,
  variant,
  prefixIcon,
  ...rest
}: Props) => (
  <Button
    type="submit"
    disabled={disabled}
    variant={variant ?? "primary"}
    prefixIcon={prefixIcon}
    dataHook="form-submit-button"
    {...rest}
  >
    {children}
  </Button>
)
