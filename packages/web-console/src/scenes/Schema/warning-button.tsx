import { Button } from "@questdb/react-components"
import styled from "styled-components"

export const WarningButton = styled(Button)`
  background: #352615;
  border: 1px #654a2c solid;
  color: ${({ theme }) => theme.color.orange};
  padding: 2px 8px;
  font-size: 1.2rem;
  width: 9.5rem;
  justify-content: flex-start;

  &:hover {
    background-color: #654a2c !important;
    border-color: #654a2c !important;
  }
`
