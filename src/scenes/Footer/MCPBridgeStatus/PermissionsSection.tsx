import React from "react"
import styled from "styled-components"
import { CaretDown } from "@styled-icons/boxicons-regular"
import { Button } from "../../../components"
import { DropdownMenu } from "../../../components/DropdownMenu"
import type { Permissions } from "../../../utils/tools/permissions"

type Level = "none" | "schema" | "read" | "write"

const PERMISSIONS_BY_LEVEL: Record<Level, Permissions> = {
  none: { grantSchemaAccess: false, read: false, write: false },
  schema: { grantSchemaAccess: true, read: false, write: false },
  read: { grantSchemaAccess: true, read: true, write: false },
  write: { grantSchemaAccess: true, read: true, write: true },
}

const levelFromPermissions = (p: Permissions): Level => {
  if (p.write) return "write"
  if (p.read) return "read"
  if (p.grantSchemaAccess) return "schema"
  return "none"
}

type Option = {
  level: Level
  label: string
  hint: string
}

const OPTIONS: Option[] = [
  {
    level: "none",
    label: "None",
    hint: "AI cannot read schema or data, and cannot execute SQL.",
  },
  {
    level: "schema",
    label: "Schema access",
    hint: "Read table list, columns, and details.",
  },
  {
    level: "read",
    label: "Read",
    hint: "Read data and schema (DQL).",
  },
  {
    level: "write",
    label: "Write",
    hint: "Read data and schema, modify data (DQL, DDL, DML).",
  },
]

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  font-size: 1.1rem;
  width: 100%;
`

const FieldLabel = styled.span`
  color: ${({ theme }) => theme.color.gray2};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 600;
`

const RichTitle = styled.span`
  font-size: 1.8rem;
  font-weight: 600;
  color: ${({ theme }) => theme.color.foreground};
`

const TriggerButton = styled(Button).attrs({ skin: "secondary" })`
  justify-content: space-between;
  width: 100%;
  height: 4.4rem;
  padding: 0.6rem 1.2rem;
  gap: 1.2rem;
  font-weight: 400;
`

const TriggerLabel = styled.span`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.2rem;
  min-width: 0;
  text-align: left;
`

const TriggerTitle = styled.span`
  font-size: 1.4rem;
  color: ${({ theme }) => theme.color.foreground};
`

const TriggerHint = styled.span`
  font-size: 1.1rem;
  color: ${({ theme }) => theme.color.gray2};
`

const Content = styled(DropdownMenu.Content)`
  background: ${({ theme }) => theme.color.backgroundLighter};
  border: 1px solid ${({ theme }) => theme.color.selection};
  box-shadow: 0 7px 30px -10px ${({ theme }) => theme.color.black};
  padding: 0.4rem;
  min-width: var(--radix-dropdown-menu-trigger-width);
`

const ItemRoot = styled.div`
  position: relative;
`

const Item = styled(DropdownMenu.Item)`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.2rem;
  padding: 0.8rem 2.4rem 0.8rem 1rem;
`

const ItemLabel = styled.span`
  font-size: 1.3rem;
  font-weight: 500;
  color: ${({ theme }) => theme.color.foreground};
`

const ItemHint = styled.span`
  font-size: 1.2rem;
  color: ${({ theme }) => theme.color.gray2};
`

const Check = styled.span`
  position: absolute;
  right: 1rem;
  top: 50%;
  transform: translateY(-50%);
  color: ${({ theme }) => theme.color.pinkPrimary};
  font-size: 1.3rem;
  pointer-events: none;
`

type Props = {
  value: Permissions
  onChange: (next: Permissions) => void
  disabled?: boolean
  variant?: "compact" | "rich"
}

export const PermissionsSection: React.FC<Props> = ({
  value,
  onChange,
  disabled = false,
  variant = "compact",
}) => {
  const currentLevel = levelFromPermissions(value)
  const current = OPTIONS.find((o) => o.level === currentLevel) ?? OPTIONS[0]

  const handleSelect = (level: Level) => {
    onChange(PERMISSIONS_BY_LEVEL[level])
  }

  const trigger = (
    <DropdownMenu.Trigger asChild>
      <TriggerButton disabled={disabled} dataHook="permissions-trigger">
        <TriggerLabel>
          <TriggerTitle>{current.label}</TriggerTitle>
          <TriggerHint>{current.hint}</TriggerHint>
        </TriggerLabel>
        <CaretDown size={16} />
      </TriggerButton>
    </DropdownMenu.Trigger>
  )

  const content = (
    <DropdownMenu.Portal>
      <Content sideOffset={4} align="start">
        {OPTIONS.map((opt) => (
          <ItemRoot key={opt.level}>
            <Item
              onSelect={() => handleSelect(opt.level)}
              data-hook={`permission-level-${opt.level}`}
            >
              <ItemLabel>{opt.label}</ItemLabel>
              <ItemHint>{opt.hint}</ItemHint>
            </Item>
            {opt.level === currentLevel && <Check>✓</Check>}
          </ItemRoot>
        ))}
      </Content>
    </DropdownMenu.Portal>
  )

  if (variant === "rich") {
    return (
      <Field data-hook="permissions">
        <RichTitle>Permissions</RichTitle>
        <DropdownMenu.Root>
          {trigger}
          {content}
        </DropdownMenu.Root>
      </Field>
    )
  }

  return (
    <Field data-hook="permissions">
      <FieldLabel>Permissions</FieldLabel>
      <DropdownMenu.Root>
        {trigger}
        {content}
      </DropdownMenu.Root>
    </Field>
  )
}
