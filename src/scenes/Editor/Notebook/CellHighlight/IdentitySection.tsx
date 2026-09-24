import React from "react"
import { WarningIcon } from "@phosphor-icons/react"
import type { ColumnDefinition } from "../../../../utils/questdb/types"
import type { MatchStats } from "../../../../components/ResultGrid/highlight"
import { FieldGroup } from "../CellChart/chartSettingsStyles"
import {
  CompactMultiSelect,
  SectionHeader,
  SectionHint,
  SectionTitle,
  StatusLine,
} from "./highlightSettingsStyles"

type Props = {
  columns: ColumnDefinition[]
  value: string[]
  stats: MatchStats | null
  onChange: (columns: string[]) => void
}

export const IdentitySection: React.FC<Props> = ({
  columns,
  value,
  stats,
  onChange,
}) => {
  const duplicateCount = stats?.ambiguous ?? 0
  return (
    <FieldGroup>
      <SectionHeader>
        <SectionTitle>Match rows using</SectionTitle>
        <SectionHint>row identity across refreshes</SectionHint>
      </SectionHeader>
      <CompactMultiSelect
        name="Match rows using"
        options={columns.map((column) => ({
          label: column.name,
          value: column.name,
        }))}
        value={value}
        onChange={(next) => {
          if (next.length > 0) onChange(next)
        }}
      />
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
