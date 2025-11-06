import styled from "styled-components"

export const GroupHeader = styled.div`
  display: flex;
  justify-content: center;
  width: 100%;
  padding: 2rem 0;
  border-bottom: 0.1rem ${({ theme }) => theme.color.selection} solid;
`
