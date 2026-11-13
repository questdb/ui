import React from "react"
import styled from "styled-components"
import type { VariableOption } from "../../../../../store/notebook"

const PREVIEW_LIMIT = 20

const Chips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
`

const Chip = styled.span`
  padding: 0.2rem 0.6rem;
  border-radius: 0.4rem;
  background: ${({ theme }) => theme.color.surfaceInset};
  color: ${({ theme }) => theme.color.contentPrimary};
  font-family: ${({ theme }) => theme.fontMonospace};
  font-size: 1.2rem;
`

type Props = {
  options: VariableOption[]
}

export const OptionsPreview = ({ options }: Props) =>
  options.length === 0 ? null : (
    <Chips data-hook="variable-options-preview">
      {options.slice(0, PREVIEW_LIMIT).map((option) => (
        <Chip key={option.value} title={option.value}>
          {option.label}
        </Chip>
      ))}
      {options.length > PREVIEW_LIMIT && (
        <Chip>+{options.length - PREVIEW_LIMIT}</Chip>
      )}
    </Chips>
  )
