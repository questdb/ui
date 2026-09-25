import React from "react"
import { WarningIcon } from "@phosphor-icons/react"
import type { ColumnDefinition } from "../../../../utils/questdb/types"
import type { MatchStats } from "../../../../components/ResultGrid/highlight"
import { FieldGroup } from "../CellChart/chartSettingsStyles"
import {
  ColumnPicker,
  FieldError,
  SectionHeader,
  SectionHint,
  SectionTitle,
  StatusLine,
} from "./highlightSettingsStyles"

type Props = {
  columns: ColumnDefinition[]
  value: string[]
  stats: MatchStats | null
  error: string | null
  onChange: (columns: string[]) => void
}

export const IdentitySection: React.FC<Props> = ({
  columns,
  value,
  stats,
  error,
  onChange,
}) => {
  const duplicateCount = stats?.ambiguous ?? 0
  const options = columns.map((column) => ({
    label: column.name,
    value: column.name,
  }))

  return (
    <FieldGroup>
      <SectionHeader>
        <SectionTitle>Match rows using</SectionTitle>
        <SectionHint>needed for comparison rules</SectionHint>
      </SectionHeader>
      <ColumnPicker
        variant="field"
        options={options}
        value={value.join(", ")}
        selectedValues={value}
        onReset={() => onChange([])}
        placeholder="Select columns"
        searchPlaceholder="Column name"
        emptyLabel="No columns yet, type a name"
        noMatchLabel="No columns matched"
        allowCustom
        ariaLabel="Match rows using"
        ariaInvalid={error !== null}
        dataHookBase="highlight-identity"
        onSelect={(name) => {
          onChange(
            value.includes(name)
              ? value.filter((selected) => selected !== name)
              : [name, ...value],
          )
        }}
      />
      {error && <FieldError>{error}</FieldError>}
      {duplicateCount > 0 && (
        <StatusLine data-hook="highlight-identity-status">
          <WarningIcon size={14} />
          {duplicateCount} {duplicateCount === 1 ? "row shares" : "rows share"}{" "}
          a key with another row.
        </StatusLine>
      )}
    </FieldGroup>
  )
}
