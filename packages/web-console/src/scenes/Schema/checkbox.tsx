import React from "react"
import styled from "styled-components"
import { Box } from "@questdb/react-components"
import { color } from "../../utils"
import { CheckboxCircle } from "@styled-icons/remix-fill"

const Root = styled(Box).attrs({
  align: "center",
  justifyContent: "center",
})<{ $visible?: boolean }>`
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  opacity: ${({ $visible }) => ($visible ? 1 : 0)};
  transition: opacity 275ms ease-in-out;
  pointer-events: ${({ $visible }) => ($visible ? "auto" : "none")};
`

const Unchecked = styled.div`
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 1px solid ${color("gray2")};
  cursor: pointer;
`

export const Checkbox = ({
  visible,
  checked,
  onClick,
}: {
  visible?: boolean
  checked?: boolean
  onClick?: () => void
}) => {
  return (
    <Root {...(onClick ? { onClick } : {})} $visible={visible}>
      {checked ? <CheckboxCircle size="16px" /> : <Unchecked />}
    </Root>
  )
}
