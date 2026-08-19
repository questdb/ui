import styled from "styled-components"
import { Box } from "../Box"

/**
 * Scrollable body of a drawer. It fills whatever the title bar leaves rather
 * than deriving a height from the viewport, so a change to the header cannot
 * push the last rows of content out of reach.
 */
export const ContentWrapper = styled(Box).attrs({
  gap: "0",
  flexDirection: "column",
})`
  width: 100%;
  flex: 1;
  min-height: 0;
  overflow: auto;
  background: ${({ theme }) => theme.color.surfaceBase};

  form {
    width: 100%;
    height: 100%;
  }
`
