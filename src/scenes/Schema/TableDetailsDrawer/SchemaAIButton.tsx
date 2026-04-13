import React from "react"
import styled from "styled-components"
import { Button, ButtonProps } from "../../../components"
import { AISparkle } from "../../../components/AISparkle"
import {
  isBlockingAIStatus,
  useAIStatus,
} from "../../../providers/AIStatusProvider"

const AIButtonStyled = styled(Button).attrs({
  skin: "gradient",
  prefixIcon: <AISparkle size={14} variant="hollow" />,
})`
  border: 1px solid ${({ theme }) => theme.color.pinkDarker};
  &:hover:not([disabled]) {
    border: 1px solid ${({ theme }) => theme.color.pinkDarker};
  }
`

export const SchemaAIButton = ({
  onClick,
  children,
  ...props
}: ButtonProps) => {
  const { hasSchemaAccess, canUse, status } = useAIStatus()
  const isOperationInProgress = isBlockingAIStatus(status)
  return (
    <AIButtonStyled
      onClick={onClick}
      disabled={!canUse || !hasSchemaAccess || isOperationInProgress}
      disabledTooltip={
        !canUse
          ? "AI Assistant is not configured"
          : !hasSchemaAccess
            ? "Schema access is not granted to this model"
            : isOperationInProgress
              ? "An operation is in progress"
              : undefined
      }
      {...props}
    >
      {children}
    </AIButtonStyled>
  )
}
