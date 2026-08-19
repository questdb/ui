import React from "react"
import styled from "styled-components"
import * as RadixDropdownMenu from "@radix-ui/react-dropdown-menu"
import { CheckIcon } from "@phosphor-icons/react"
import { menuItemStyles } from "../menuStyles"
import { SelectMenu, SelectMenuTriggerButton } from "../SelectMenu"

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

const Item = styled(RadixDropdownMenu.CheckboxItem)`
  ${menuItemStyles}
  display: grid;
  grid-template-columns: minmax(0, 1fr) 1.8rem;
  gap: 0.8rem;
  padding: 0.7rem 0.8rem;
`

const ItemLabel = styled.span`
  min-width: 0;
  overflow: hidden;
  font-size: 1.3rem;
  font-weight: 500;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const ItemIndicator = styled(RadixDropdownMenu.ItemIndicator)`
  display: inline-flex;
  width: 1.8rem;
  height: 1.8rem;
  align-items: center;
  justify-content: center;
  color: ${({ theme }) => theme.color.contentAccent};
`

const Empty = styled.div`
  font-size: ${({ theme }) => theme.fontSize.sm};
  color: ${({ theme }) => theme.color.contentSecondary};
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
      <RadixDropdownMenu.Trigger asChild>
        <SelectMenuTriggerButton
          className={className}
          label={summary}
          labelFontSize="1.3rem"
          fullWidth
          disabled={disabled}
          title={summary}
          aria-label={[name, summary].filter(Boolean).join(": ")}
        />
      </RadixDropdownMenu.Trigger>
      <RadixDropdownMenu.Portal>
        <SelectMenu.Content
          sideOffset={4}
          align="start"
          minWidth="var(--radix-dropdown-menu-trigger-width)"
        >
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
                  <ItemLabel>{opt.label}</ItemLabel>
                  <ItemIndicator>
                    <CheckIcon size={16} weight="bold" />
                  </ItemIndicator>
                </Item>
              )
            })
          )}
        </SelectMenu.Content>
      </RadixDropdownMenu.Portal>
    </RadixDropdownMenu.Root>
  )
}
