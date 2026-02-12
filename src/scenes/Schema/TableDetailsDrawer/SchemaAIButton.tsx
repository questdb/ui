import React from "react"
import styled from "styled-components"
import { Button, ButtonProps } from "../../../components"
import { AISparkle } from "../../../components/AISparkle"
import { useAIStatus } from "../../../providers/AIStatusProvider"

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
  const { hasSchemaAccess, canUse } = useAIStatus()
  return (
    <AIButtonStyled
      onClick={onClick}
      disabled={!canUse || !hasSchemaAccess}
      disabledTooltip={
        !canUse
          ? "AI Assistant is not configured"
          : !hasSchemaAccess
            ? "Schema access is not granted to this model"
            : undefined
      }
      {...props}
    >
      {children}
    </AIButtonStyled>
  )
}
