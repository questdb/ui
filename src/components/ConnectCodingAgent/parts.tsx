import React, { ReactNode } from "react"
import styled from "styled-components"
import { color } from "../../utils"
import { Badge as StatusBadge } from "../Badge"

// Small parts the surfaces that offer to connect a coding agent share.

export const TitleRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.8rem;
`

export const Badge = styled(StatusBadge).attrs({
  variant: "accent",
  size: "sm",
})``

const SeparatorRow = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.4rem;
`

const SeparatorLine = styled.div`
  flex: 1;
  height: 1px;
  background: ${color("interactionNeutral")};
`

const SeparatorLabel = styled.div`
  display: flex;
  align-items: center;
  gap: 0.8rem;
  color: ${color("contentMuted")};
  font-size: 1.3rem;
  white-space: nowrap;
`

export const Separator = ({
  icon,
  label,
}: {
  icon?: ReactNode
  label: string
}) => (
  <SeparatorRow>
    <SeparatorLine />
    <SeparatorLabel>
      {icon}
      {label}
    </SeparatorLabel>
    <SeparatorLine />
  </SeparatorRow>
)
