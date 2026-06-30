import styled, { keyframes } from "styled-components"
import { CircleNotchIcon } from "@phosphor-icons/react"

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`

// Neutral (non-brand) spinner for toolbar controls.
export const Spinner = styled(CircleNotchIcon)`
  color: ${({ theme }) => theme.color.foreground};
  animation: ${spin} 0.8s linear infinite;
`
