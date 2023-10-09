import styled from "styled-components"
import { Box } from "../Box"
export const ContentWrapper = styled(Box).attrs({
  gap: "0",
  flexDirection: "column",
})`
  width: 100%;
  /*
    4.5rem = top bar
    4.5rem = drawer title
    4.5rem = footer
  */
  height: calc(100vh - 4.5rem - 4.5rem - 4.5rem);

  form {
    width: 100%;
    height: 100%;
  }
`
