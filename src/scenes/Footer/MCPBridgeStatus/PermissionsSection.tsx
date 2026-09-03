import React from "react"
import styled from "styled-components"
import { SelectMenu } from "../../../components"
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
    hint: "AI cannot read schema or data. Read-only queries it runs show results only in your console.",
  },
  {
    level: "schema",
    label: "Schema access",
    hint: "Read table list, columns, and details. Can run read-only queries whose results stay in your console.",
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
  color: ${({ theme }) => theme.color.contentSecondary};
  text-transform: uppercase;
  font-weight: 600;
`

const RichField = styled(Field)`
  gap: 1.6rem;
`

const RichTitle = styled.span`
  font-size: 1.6rem;
  font-weight: 600;
  color: ${({ theme }) => theme.color.contentPrimary};
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

  const handleSelect = (level: string) => {
    onChange(PERMISSIONS_BY_LEVEL[level as Level])
  }

  const trigger = (
    <SelectMenu.Trigger
      disabled={disabled}
      dataHook="permissions-trigger"
      label={current.label}
      description={current.hint}
      fullWidth
      rich
    />
  )

  const content = (
    <SelectMenu.Portal>
      <SelectMenu.Content sideOffset={4} align="start">
        <SelectMenu.RadioGroup
          value={currentLevel}
          onValueChange={handleSelect}
        >
          {OPTIONS.map((opt) => (
            <SelectMenu.Item
              key={opt.level}
              value={opt.level}
              description={opt.hint}
              data-hook={`permission-level-${opt.level}`}
            >
              {opt.label}
            </SelectMenu.Item>
          ))}
        </SelectMenu.RadioGroup>
      </SelectMenu.Content>
    </SelectMenu.Portal>
  )

  if (variant === "rich") {
    return (
      <RichField data-hook="permissions">
        <RichTitle>Permissions</RichTitle>
        <SelectMenu.Root modal={false}>
          {trigger}
          {content}
        </SelectMenu.Root>
      </RichField>
    )
  }

  return (
    <Field data-hook="permissions">
      <FieldLabel>Permissions</FieldLabel>
      <SelectMenu.Root modal={false}>
        {trigger}
        {content}
      </SelectMenu.Root>
    </Field>
  )
}
