import React from "react"
import styled from "styled-components"
import { SelectMenu } from "../SelectMenu"

export type ReasoningEffortLevel = "default" | "high"

type Option = {
  level: ReasoningEffortLevel
  label: string
}

const OPTIONS: Option[] = [
  { level: "default", label: "Default" },
  { level: "high", label: "High" },
]

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.6rem;
  font-size: 1.1rem;
  width: 100%;
`

const RichTitle = styled.span`
  font-size: 1.6rem;
  font-weight: 600;
  color: ${({ theme }) => theme.color.contentPrimary};
`

type Props = {
  value: ReasoningEffortLevel
  onChange: (next: ReasoningEffortLevel) => void
  disabled?: boolean
}

export const ReasoningSection: React.FC<Props> = ({
  value,
  onChange,
  disabled = false,
}) => {
  const current = OPTIONS.find((o) => o.level === value) ?? OPTIONS[0]

  return (
    <Field data-hook="reasoning">
      <RichTitle>Reasoning</RichTitle>
      <SelectMenu.Root modal={false}>
        <SelectMenu.Trigger
          disabled={disabled}
          dataHook="reasoning-trigger"
          aria-label={`Reasoning: ${current.label}`}
          label={current.label}
          labelFontSize="1.4rem"
          fullWidth
        />
        <SelectMenu.Portal>
          <SelectMenu.Content sideOffset={4} align="start">
            <SelectMenu.RadioGroup
              value={value}
              onValueChange={(level) => onChange(level as ReasoningEffortLevel)}
            >
              {OPTIONS.map((opt) => (
                <SelectMenu.Item
                  key={opt.level}
                  value={opt.level}
                  data-hook={`reasoning-level-${opt.level}`}
                >
                  {opt.label}
                </SelectMenu.Item>
              ))}
            </SelectMenu.RadioGroup>
          </SelectMenu.Content>
        </SelectMenu.Portal>
      </SelectMenu.Root>
    </Field>
  )
}
