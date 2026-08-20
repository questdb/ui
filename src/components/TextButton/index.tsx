import styled from "styled-components"

import { Button } from "../Button"

/**
 * Low-emphasis inline action. It keeps the shared ghost interaction states
 * while allowing link-like placement inside prose, notices, and metadata.
 */
export const TextButton = styled(Button).attrs({
  variant: "ghost",
  size: "sm",
})`
  width: auto;
  height: auto;
  min-height: 2.4rem;
  padding: 0.2rem 0.4rem;
  font: inherit;
  font-weight: 600;
`
