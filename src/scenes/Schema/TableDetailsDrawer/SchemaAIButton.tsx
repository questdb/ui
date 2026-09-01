import React from "react"
import styled from "styled-components"
import { Button, ButtonProps } from "../../../components"
import { AISparkle } from "../../../components/AISparkle"
import {
  isBlockingAIStatus,
  useAIStatus,
} from "../../../providers/AIStatusProvider"

const AIButtonStyled = styled(Button).attrs({
  variant: "gradient",
  prefixIcon: <AISparkle size={14} variant="hollow" />,
})``

export const SchemaAIButton = ({
  onClick,
  children,
  disabled,
  disabledTooltip,
  ...props
}: ButtonProps) => {
  const { hasSchemaAccess, canUse, status } = useAIStatus()
  const isOperationInProgress = isBlockingAIStatus(status)
  const aiDisabled = !canUse || !hasSchemaAccess || isOperationInProgress
  const aiDisabledTooltip = !canUse
    ? "AI Assistant is not configured"
    : !hasSchemaAccess
      ? "Schema access is not granted to this model"
      : isOperationInProgress
        ? "An operation is in progress"
        : undefined

  return (
    <AIButtonStyled
      onClick={onClick}
      disabled={disabled || aiDisabled}
      disabledTooltip={disabled ? disabledTooltip : aiDisabledTooltip}
      {...props}
    >
      {children}
    </AIButtonStyled>
  )
}
