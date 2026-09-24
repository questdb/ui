import styled from "styled-components"
import { WarningIcon } from "@phosphor-icons/react"

export const IncompatibleIcon = styled(WarningIcon)`
  color: ${({ theme }) => theme.color.statusWarning};
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
  color: ${({ theme }) => theme.color.contentSecondary};
`

export const CheckboxRow = styled.label`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.2rem;
  color: ${({ theme }) => theme.color.contentPrimary};
  cursor: pointer;
`
