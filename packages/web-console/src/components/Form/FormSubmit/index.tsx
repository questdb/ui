import React from "react"
import type { Props as ButtonProps } from "@questdb/react-components/dist/components/Button"
import { Button } from "@questdb/react-components"

type Props = {
  children: React.ReactNode
  disabled?: boolean
  variant?: "error" | "success" | "warning" | "primary" | "secondary"
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
    skin={variant ?? "primary"}
    prefixIcon={prefixIcon}
    dataHook="form-submit-button"
    {...rest}
  >
    {children}
  </Button>
)
