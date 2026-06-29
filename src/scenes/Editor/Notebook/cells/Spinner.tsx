import styled, { keyframes } from "styled-components"
import { CircleNotchIcon } from "@phosphor-icons/react"

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`

// Plain foreground-colored loading spinner for cell toolbar controls (the
// gradient CircleNotchSpinner reads as a brand accent, not a neutral "busy").
export const Spinner = styled(CircleNotchIcon)`
  color: ${({ theme }) => theme.color.foreground};
  animation: ${spin} 0.8s linear infinite;
`
