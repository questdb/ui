import styled from "styled-components"
import { Box } from "../Box"

export const Sidebar = styled(Box).attrs({ flexDirection: "column" })`
  width: 4rem;
  height: 100%;
  background: ${({ theme }) => theme.color.backgroundDarker};
`
