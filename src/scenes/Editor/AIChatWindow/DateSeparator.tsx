import React from "react"
import styled from "styled-components"
import { ClockCountdownIcon } from "@phosphor-icons/react"
import { color } from "../../../utils"

const Container = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.4rem 0;
  width: 100%;
`

const Line = styled.div`
  flex: 1;
  height: 1px;
  background: ${color("selection")};
`

const LabelContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 0.8rem;
  color: ${color("gray2")};
`

const Label = styled.span`
  font-size: 1.3rem;
  letter-spacing: 0.016rem;
  white-space: nowrap;
`

type DateSeparatorProps = {
  label: string
}

export const DateSeparator: React.FC<DateSeparatorProps> = ({ label }) => {
  return (
    <Container>
      <Line />
      <LabelContainer>
        <ClockCountdownIcon size={16} />
        <Label>{label}</Label>
      </LabelContainer>
      <Line />
    </Container>
  )
}
