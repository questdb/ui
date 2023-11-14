import styled from "styled-components"
import React from "react"
import { PopperHover, Tooltip } from "../../components"
import { ArrowLeftShort } from "@styled-icons/bootstrap"

const Icon = styled.button`
  appearance: none;
  background: transparent;
  color: inherit;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 5.5rem;
  border: 0;
  border-right: 2px solid #2c2e3d;
  cursor: pointer;
  transition: background 0.2s ease-in-out;
  margin: 0.5rem 0 0.5rem 0.5rem;
  border-radius: 6px 0 0 6px;

  &:hover {
    background: #2c2e3d;
    border-color: #404040;
  }
`

type Props = {
  label?: string
  onClick: () => void
}

export const BackButton = ({ onClick, label = "Back to the Cloud" }: Props) => (
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
      <Icon onClick={onClick}>
        <ArrowLeftShort size={20} />
      </Icon>
    }
  >
    <Tooltip>{label}</Tooltip>
  </PopperHover>
)
