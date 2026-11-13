import styled from "styled-components"
import { IconButton } from "../../components"

export const RowIconButton = styled(IconButton).attrs({
  size: "sm",
  variant: "ghost",
})`
  color: ${({ theme }) => theme.color.contentSecondary};

  &:hover:not(:disabled) {
    color: ${({ theme }) => theme.color.contentPrimary};
  }
`

export const DeleteRowButton = styled(IconButton).attrs({
  size: "sm",
  variant: "dangerQuiet",
})``

export const ROW_ICON_SIZE = 15
