import styled, { css } from "styled-components"
import { Input } from "../../../components/Input"
import { color } from "../../../utils"

export const notebookRenameFieldStyles = css`
  min-width: 0;
  font-family: inherit;
  font-size: 1.6rem;
  font-weight: 600;
  line-height: 1;
  letter-spacing: normal;
  color: ${color("contentPrimary")};
  background: transparent;
  border: 1px solid ${color("actionPrimary")};
  border-radius: 4px;
  outline: none;
  padding: 0.2rem 0.6rem;
`

export const NotebookRenameInput = styled(Input)`
  ${notebookRenameFieldStyles}
`
