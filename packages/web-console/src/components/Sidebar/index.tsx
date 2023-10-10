import styled from "styled-components"
import { Box } from "../Box"

export const Sidebar = styled(Box).attrs({ flexDirection: "column" })<{align?: "top" | "bottom"}>`
  width: 4.5rem;
  height: 100%;
  background: ${({ theme }) => theme.color.backgroundDarker};
  gap: 0;
  flex-shrink: 0;
  justify-content: ${({align}) => align === "top" ? "flex-start" : "flex-end"};
`
