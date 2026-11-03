import styled from "styled-components"

export const PaneEmptyState = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${({ theme }) => theme.color.contentSecondary};
  font-size: ${({ theme }) => theme.fontSize.sm};
`
