import React from "react"
import type { Props as ButtonProps } from "@questdb/react-components/dist/components/Button"
import { Button } from "@questdb/react-components"
import { useFormContext } from "react-hook-form"

type Props<TFormValues> = {
  children: React.ReactNode
  disabled?: boolean
  variant?: "warning" | "secondary"
  prefixIcon?: ButtonProps["prefixIcon"]
  defaultValues?: TFormValues
  onClick?: () => void
}

export const FormCancel = <TFormValues extends Record<string, any>>({
  children,
  disabled,
  variant,
  prefixIcon,
  defaultValues,
  onClick,
}: Props<TFormValues>) => {
  const { reset } = useFormContext()

  return (
    <Button
      type="button"
      onClick={() => {
        reset(defaultValues)
        if (onClick) {
          onClick()
        }
      }}
      disabled={disabled}
      skin={variant ?? "secondary"}
      prefixIcon={prefixIcon}
      dataHook="form-cancel-button"
    >
      {children}
    </Button>
  )
}
