import React from "react"
import styled from "styled-components"

const Root = styled.span`
  position: relative;
`

const Tick = styled.span`
  position: absolute;
  right: 0;
  top: 0;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 50%;
  background-color: ${({ theme }) => theme.color.red};
`

const Count = styled.span`
  position: absolute;
  left: 100%;
  top: -50%;
  font-size: ${({ theme }) => theme.fontSize.ms};
  border-radius: 6px;
  background-color: #c64242;
  color: ${({ theme }) => theme.color.white};
  padding: 0.2rem 0.4rem;
`

type Props = {
  icon?: React.ReactNode
  label?: string
  tick?: boolean
  count?: number
}

export const UnreadItemsIcon = ({ icon, label, tick, count }: Props) => (
  <Root>
    {typeof count === "number" && count > 0 && <Count>{count}</Count>}
    {icon}
    {tick && <Tick />}
    {label && <span>{label}</span>}
  </Root>
)
