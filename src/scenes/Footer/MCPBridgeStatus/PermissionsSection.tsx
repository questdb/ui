import React from "react"
import styled from "styled-components"
import {
  togglePermission,
  type Permissions,
} from "../../../utils/tools/permissions"

const CompactWrapper = styled.fieldset`
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  margin: 0;
  padding: 1rem 1.2rem;
  border: 1px solid ${({ theme }) => theme.color.selection};
  border-radius: 0.6rem;
`

const CompactLegend = styled.legend`
  font-size: 1.1rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 600;
  color: ${({ theme }) => theme.color.gray2};
  padding: 0 0.4rem;
`

const CompactRow = styled.label<{ $disabled?: boolean }>`
  display: flex;
  align-items: flex-start;
  gap: 0.8rem;
  cursor: ${({ $disabled }) => ($disabled ? "not-allowed" : "pointer")};
  opacity: ${({ $disabled }) => ($disabled ? 0.7 : 1)};

  input[type="checkbox"] {
    margin-top: 0.3rem;
    cursor: ${({ $disabled }) => ($disabled ? "not-allowed" : "pointer")};
    flex-shrink: 0;
  }
`

const CompactBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
  line-height: 1.4;
`

const CompactLabel = styled.span`
  font-size: 1.3rem;
  color: ${({ theme }) => theme.color.foreground};
  font-weight: 500;
`

const CompactHint = styled.span`
  font-size: 1.2rem;
  color: ${({ theme }) => theme.color.gray2};
`

const RichWrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2rem;
  width: 100%;
`

const RichTitle = styled.span`
  font-size: 1.8rem;
  font-weight: 600;
  color: ${({ theme }) => theme.color.foreground};
`

const RichRow = styled.label<{ $disabled?: boolean }>`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 2.4rem;
  width: 100%;
  cursor: ${({ $disabled }) => ($disabled ? "not-allowed" : "pointer")};
  opacity: ${({ $disabled }) => ($disabled ? 0.7 : 1)};

  input[type="checkbox"] {
    cursor: ${({ $disabled }) => ($disabled ? "not-allowed" : "pointer")};
    flex-shrink: 0;
    width: 1.6rem;
    height: 1.6rem;
  }
`

const RichInfoColumn = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  flex: 1;
  align-items: flex-start;
  min-width: 0;
`

const RichName = styled.span`
  font-size: 1.4rem;
  font-weight: 400;
  color: ${({ theme }) => theme.color.foreground};
`

const RichDescription = styled.span`
  font-size: 1.1rem;
  color: ${({ theme }) => theme.color.gray2};
`

type Props = {
  value: Permissions
  onChange: (next: Permissions) => void
  disabled?: boolean
  variant?: "compact" | "rich"
}

type RowSpec = {
  key: "grantSchemaAccess" | "read" | "write"
  hook: string
  label: string
  hint: string
  checked: boolean
  disabled: boolean
  title?: string
}

export const PermissionsSection: React.FC<Props> = ({
  value,
  onChange,
  disabled = false,
  variant = "compact",
}) => {
  const schemaLockedByRead = value.read
  const readLockedByWrite = value.write

  const handle =
    (key: RowSpec["key"]) => (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(togglePermission(value, key, e.target.checked))
    }

  const rows: RowSpec[] = [
    {
      key: "grantSchemaAccess",
      hook: "permission-schema",
      label: "Schema access",
      hint: "Read table list, columns, and details",
      checked: value.grantSchemaAccess,
      disabled: disabled || schemaLockedByRead,
      title: schemaLockedByRead
        ? "Reading data requires schema access."
        : undefined,
    },
    {
      key: "read",
      hook: "permission-read",
      label: "Read",
      hint: "Read data and schema, run DQL",
      checked: value.read,
      disabled: disabled || readLockedByWrite,
      title: readLockedByWrite
        ? "Writing data requires the read permission."
        : undefined,
    },
    {
      key: "write",
      hook: "permission-write",
      label: "Write",
      hint: "Modify data (DDL/DML)",
      checked: value.write,
      disabled,
    },
  ]

  if (variant === "rich") {
    return (
      <RichWrapper data-hook="permissions">
        <RichTitle>Permissions</RichTitle>
        {rows.map((row) => (
          <RichRow key={row.key} $disabled={row.disabled} title={row.title}>
            <RichInfoColumn>
              <RichName>{row.label}</RichName>
              <RichDescription>{row.hint}</RichDescription>
            </RichInfoColumn>
            <input
              type="checkbox"
              checked={row.checked}
              disabled={row.disabled}
              onChange={handle(row.key)}
              data-hook={row.hook}
            />
          </RichRow>
        ))}
      </RichWrapper>
    )
  }

  return (
    <CompactWrapper data-hook="permissions">
      <CompactLegend>Permissions</CompactLegend>
      {rows.map((row) => (
        <CompactRow key={row.key} $disabled={row.disabled} title={row.title}>
          <input
            type="checkbox"
            checked={row.checked}
            disabled={row.disabled}
            onChange={handle(row.key)}
            data-hook={row.hook}
          />
          <CompactBody>
            <CompactLabel>{row.label}</CompactLabel>
            <CompactHint>{row.hint}</CompactHint>
          </CompactBody>
        </CompactRow>
      ))}
    </CompactWrapper>
  )
}
