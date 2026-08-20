import styled from "styled-components"
import { Box } from "../Box"
import {
  SIDEBAR_BUTTON_SIZE,
  SIDEBAR_ICON_SIZE,
  SIDEBAR_WIDTH,
} from "../../consts"

export const Sidebar = styled(Box).attrs({ flexDirection: "column" })<{
  align?: "top" | "bottom"
}>`
  padding-top: ${({ align }) => (align === "top" ? "1.2rem" : "0")};
  width: ${SIDEBAR_WIDTH};
  height: 100%;
  background: ${({ theme }) => theme.color.surfaceBase};
  border-right: 1px solid ${({ theme }) => theme.color.borderSubtle};
  gap: 0.8rem;
  flex-shrink: 0;
  justify-content: ${({ align }) =>
    align === "top" ? "flex-start" : "flex-end"};
  align-items: center;

  && button {
    width: ${SIDEBAR_BUTTON_SIZE};
    min-width: ${SIDEBAR_BUTTON_SIZE};
    height: ${SIDEBAR_BUTTON_SIZE};
    min-height: ${SIDEBAR_BUTTON_SIZE};
    padding: 0.7rem;
    border-radius: 0.6rem;
  }

  button svg {
    width: ${SIDEBAR_ICON_SIZE}px;
    height: ${SIDEBAR_ICON_SIZE}px;
    flex: 0 0 ${SIDEBAR_ICON_SIZE}px;
  }

  &:last-of-type {
    border-right: 0;
    border-left: 1px solid ${({ theme }) => theme.color.borderSubtle};
  }
`
