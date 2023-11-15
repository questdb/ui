import styled from "styled-components"
import React from "react"
import { PopperHover, PrimaryToggleButton, Tooltip } from "../../components"
import { ArrowLeft } from "@styled-icons/remix-line"
import { BUTTON_ICON_SIZE } from "../../consts"

const Root = styled(PrimaryToggleButton)`
  margin-left: 0.5rem;
`

type Props = {
  label?: React.ReactNode
  onClick?: () => void
}

export const BackButton = ({ onClick, label }: Props) => (
  <PopperHover
    placement="right"
    modifiers={[
      {
        name: "offset",
        options: {
          offset: [5, 15],
        },
      },
    ]}
    trigger={
      <Root onClick={onClick}>
        <ArrowLeft size={BUTTON_ICON_SIZE} />
      </Root>
    }
  >
    <Tooltip>{label || "Back to the Cloud"}</Tooltip>
  </PopperHover>
)
