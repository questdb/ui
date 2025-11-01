import React from "react"
import styled from "styled-components"

const Root = styled.div`
  display: grid;
  place-items: center;
  height: 100vh;
  background: ${({ theme }) => theme.color.backgroundDarker};
  color: ${({ theme }) => theme.color.foreground};
`

export const CenteredLayout = ({ children }: { children: React.ReactNode }) => (
  <Root>{children}</Root>
)
