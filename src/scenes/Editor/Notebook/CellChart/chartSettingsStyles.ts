import styled from "styled-components"
import { WarningIcon } from "@phosphor-icons/react"

export const IncompatibleIcon = styled(WarningIcon)`
  color: ${({ theme }) => theme.color.orange};
  flex-shrink: 0;
`

export const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
`

export const FieldGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
`

export const FieldLabel = styled.span`
  font-size: 1.1rem;
  color: ${({ theme }) => theme.color.gray2};
`
