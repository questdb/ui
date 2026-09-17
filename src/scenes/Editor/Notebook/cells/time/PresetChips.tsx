import React from "react"
import styled from "styled-components"
import { Button } from "../../../../../components"

const Chips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
`

const Chip = styled(Button).attrs({ variant: "secondary", size: "sm" })``

export type PresetChip = {
  key: string
  label: string
}

type Props = {
  chips: PresetChip[]
  selectedKey: string | null
  onSelect: (key: string) => void
  ariaLabel: string
  dataHook: string
}

export const PresetChips = ({
  chips,
  selectedKey,
  onSelect,
  ariaLabel,
  dataHook,
}: Props) => (
  <Chips role="group" aria-label={ariaLabel}>
    {chips.map(({ key, label }) => (
      <Chip
        key={key}
        type="button"
        aria-pressed={key === selectedKey}
        onClick={() => onSelect(key)}
        data-hook={dataHook}
      >
        {label}
      </Chip>
    ))}
  </Chips>
)
