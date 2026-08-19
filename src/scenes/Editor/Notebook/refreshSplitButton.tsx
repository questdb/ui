import styled from "styled-components"

export const OverrideDot = styled.span`
  width: 0.6rem;
  height: 0.6rem;
  border-radius: 50%;
  background: ${({ theme }) => theme.color.contentAccent};
  flex-shrink: 0;
`
