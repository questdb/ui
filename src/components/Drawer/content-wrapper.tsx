import styled from "styled-components"
import { Box } from "../Box"
export const ContentWrapper = styled(Box).attrs({
  gap: "0",
  flexDirection: "column",
})<{ mode?: "modal" | "side" }>`
  width: 100%;
  /*
    4.5rem = top bar
    4.5rem = drawer title
    4rem = footer
  */
  height: ${({ mode }) =>
    mode === "side"
      ? "calc(100vh - 4.5rem - 4.5rem - 4rem)"
      : "calc(100vh - 4.5rem)"};
  form {
    width: 100%;
    height: 100%;
  }
`
