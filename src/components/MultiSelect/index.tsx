import React from "react"
import styled from "styled-components"
import * as RadixDropdownMenu from "@radix-ui/react-dropdown-menu"
import { ArrowDropDown } from "@styled-icons/remix-line"
import { Check } from "@phosphor-icons/react"

export type MultiSelectOption = {
  label: string
  value: string
}

type Props = {
  options: MultiSelectOption[]
  value: string[]
  onChange: (next: string[]) => void
  name?: string
  placeholder?: string
  disabled?: boolean
  className?: string
  // Above this count, trigger shows "X of Y" instead of comma-joined labels.
  inlineThreshold?: number
}

const Trigger = styled(RadixDropdownMenu.Trigger)`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem;
  background: ${({ theme }) => theme.color.selection};
  border: 1px transparent solid;
  padding: 0 0 0 0.75rem;
  height: 3rem;
  border-radius: 0.4rem;
  color: ${({ theme }) => theme.color.foreground};
  cursor: pointer;
  width: 100%;
  font-family: inherit;
  font-size: ${({ theme }) => theme.fontSize.md};

  &:focus,
  &[data-state="open"] {
    border-color: ${({ theme }) => theme.color.pink};
    outline: none;
  }

  &:disabled {
    cursor: default;
    color: ${({ theme }) => theme.color.gray1};
    border-color: ${({ theme }) => theme.color.gray1};
  }
`

const TriggerLabel = styled.span`
  flex: 1;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const Caret = styled(ArrowDropDown)`
  flex-shrink: 0;
  fill: ${({ theme }) => theme.color.white};
`

const Content = styled(RadixDropdownMenu.Content)`
  background: ${({ theme }) => theme.color.backgroundDarker};
  border: 1px solid ${({ theme }) => theme.color.selection};
  border-radius: 0.4rem;
  padding: 0.4rem;
  z-index: 9999;
  min-width: var(--radix-dropdown-menu-trigger-width);
  max-height: 30rem;
  overflow-y: auto;
  box-shadow: 0 0.2rem 0.8rem rgba(0, 0, 0, 0.36);
`

const Item = styled(RadixDropdownMenu.CheckboxItem)`
  font-size: ${({ theme }) => theme.fontSize.md};
  color: ${({ theme }) => theme.color.foreground};
  display: flex;
  align-items: center;
  gap: 0.8rem;
  min-height: 2.8rem;
  padding: 0.4rem 0.8rem;
  border-radius: 0.3rem;
  user-select: none;
  outline: none;
  cursor: pointer;

  &[data-highlighted] {
    background: ${({ theme }) => theme.color.tableSelection};
  }

  &[data-disabled] {
    opacity: 0.5;
    pointer-events: none;
  }
`

const CheckBox = styled.span<{ $checked: boolean }>`
  width: 1.4rem;
  height: 1.4rem;
  border-radius: 0.2rem;
  border: 1px solid
    ${({ theme, $checked }) =>
      $checked ? theme.color.pinkPrimary : theme.color.gray1};
  background: ${({ theme, $checked }) =>
    $checked ? theme.color.pinkPrimary : "transparent"};
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: ${({ theme }) => theme.color.foreground};
`

const Empty = styled.div`
  font-size: ${({ theme }) => theme.fontSize.sm};
  color: ${({ theme }) => theme.color.gray2};
  padding: 0.6rem 0.8rem;
`

const summarize = (
  value: string[],
  options: MultiSelectOption[],
  placeholder: string,
  inlineThreshold: number,
): string => {
  if (value.length === 0) return placeholder
  if (value.length === options.length && options.length > 0)
    return `All (${options.length})`
  if (value.length <= inlineThreshold) {
    return value
      .map((v) => options.find((o) => o.value === v)?.label ?? v)
      .join(", ")
  }
  return `${value.length} of ${options.length}`
}

export const MultiSelect: React.FC<Props> = ({
  options,
  value,
  onChange,
  name,
  placeholder = "None selected",
  disabled,
  className,
  inlineThreshold = 2,
}) => {
  const summary = summarize(value, options, placeholder, inlineThreshold)
  const selected = new Set(value)

  const toggle = (v: string) => {
    // Preserve option order so persisted selections stay stable across toggles.
    if (selected.has(v)) {
      onChange(value.filter((x) => x !== v))
    } else {
      onChange(
        options
          .filter((o) => selected.has(o.value) || o.value === v)
          .map((o) => o.value),
      )
    }
  }

  return (
    <RadixDropdownMenu.Root>
      <Trigger
        className={className}
        data-name={name}
        disabled={disabled}
        title={summary}
        aria-label={[name, summary].filter(Boolean).join(": ")}
      >
        <TriggerLabel>{summary}</TriggerLabel>
        <Caret size="24" />
      </Trigger>
      <RadixDropdownMenu.Portal>
        <Content sideOffset={4} align="start">
          {options.length === 0 ? (
            <Empty>No options</Empty>
          ) : (
            options.map((opt) => {
              const checked = selected.has(opt.value)
              return (
                <Item
                  key={opt.value}
                  checked={checked}
                  onCheckedChange={() => toggle(opt.value)}
                  onSelect={(e) => e.preventDefault()}
                >
                  <CheckBox $checked={checked}>
                    {checked && <Check size={10} weight="bold" />}
                  </CheckBox>
                  {opt.label}
                </Item>
              )
            })
          )}
        </Content>
      </RadixDropdownMenu.Portal>
    </RadixDropdownMenu.Root>
  )
}
