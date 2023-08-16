import styled from "styled-components"
import { Box } from "../Box"
export const ContentWrapper = styled(Box).attrs({
  gap: "0",
  flexDirection: "column",
})`
  width: 100%;
  height: calc(100vh - 6.4rem); /* height of the header */

  form {
    width: 100%;
    height: 100%;
  }
`
