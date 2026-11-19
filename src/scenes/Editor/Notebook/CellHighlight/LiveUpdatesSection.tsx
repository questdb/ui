import React from "react"
import styled from "styled-components"
import { WarningIcon } from "@phosphor-icons/react"
import { SelectMenuControl } from "../../../../components"
import type { GridMode } from "../../../../store/notebook"
import { FieldGroup } from "../CellChart/chartSettingsStyles"
import {
  SectionHeader,
  SectionHint,
  SectionTitle,
  StatusLine,
} from "./highlightSettingsStyles"

const Explanation = styled.p`
  margin: 0;
  font-size: 1.2rem;
  line-height: 1.45;
  color: ${({ theme }) => theme.color.contentSecondary};
`

export const LIVE_MODES: {
  mode: GridMode | undefined
  label: string
  summary: string
  explanation: string
}[] = [
  {
    mode: undefined,
    label: "Rows as the query returns them",
    summary: "The query's order on every refresh.",
    explanation: "Each refresh shows the rows in the query's order.",
  },
  {
    mode: "stable",
    label: "Keep rows in place",
    summary: "Rows hold their position; new ones go to the end.",
    explanation:
      "A row stays where it was across refreshes, matched by the columns above, and new rows go to the end. For watchlists sorted by a moving value.",
  },
  {
    mode: "stream",
    label: "Flash new rows",
    summary: "Rows new since the last refresh flash.",
    explanation:
      "Rows that were not in the previous refresh flash as they arrive. For trade tapes and logs: order the query newest first and LIMIT it.",
  },
]

/** A short name for the badge in the result's actions bar. */
export const liveModeBadge = (mode: GridMode): string =>
  mode === "stable" ? "Rows kept in place" : "New rows flash"

type Props = {
  mode: GridMode | undefined
  identityColumns: string[]
  // The result's columns: an identity column missing from them matches
  // nothing.
  columns: { name: string }[]
  onChange: (mode: GridMode | undefined) => void
}

/** How a refreshing grid treats its rows. */
export const LiveUpdatesSection: React.FC<Props> = ({
  mode,
  identityColumns,
  columns,
  onChange,
}) => {
  const missing = identityColumns.filter(
    (name) => !columns.some((c) => c.name === name),
  )
  const current = LIVE_MODES.find((m) => m.mode === mode) ?? LIVE_MODES[0]
  return (
    <FieldGroup>
      <SectionHeader>
        <SectionTitle>Live updates</SectionTitle>
        <SectionHint>when the cell refreshes</SectionHint>
      </SectionHeader>
      <SelectMenuControl
        name="live-updates"
        ariaLabel="Live updates"
        value={mode ?? ""}
        onValueChange={(value) =>
          onChange(value === "" ? undefined : (value as GridMode))
        }
        options={LIVE_MODES.map((m) => ({
          label: m.label,
          value: m.mode ?? "",
          description: m.summary,
        }))}
      />
      <Explanation>{current.explanation}</Explanation>
      {mode && (identityColumns.length === 0 || missing.length > 0) && (
        <StatusLine role="status">
          <WarningIcon size={14} />
          {identityColumns.length === 0
            ? "Choose the columns that match rows above; until then rows show as returned."
            : `${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} not in the result, so rows show as returned. Choose columns the query returns.`}
        </StatusLine>
      )}
    </FieldGroup>
  )
}
