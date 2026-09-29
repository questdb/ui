import React from "react"
import styled from "styled-components"
import { HighlightedSql } from "../../../../components/HighlightedSql"
import type { DeclareEntry } from "../../../../store/notebook"
import { isValidTimeRange, timeRangeToDeclareEntries } from "./timeRange"

const Lines = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
`

const Line = styled(HighlightedSql)`
  margin: 0;
  color: ${({ theme }) => theme.color.contentPrimary};
  font-family: ${({ theme }) => theme.fontMonospace};
  font-size: 1.2rem;
  line-height: 1.5;
`

type LinesProps = {
  entries: DeclareEntry[]
  stacked?: boolean
}

const declarationCode = (entry: DeclareEntry, stacked: boolean): string =>
  stacked
    ? `@${entry.name} :=\n  ${entry.value}`
    : `@${entry.name} := ${entry.value}`

export const DeclarationLines = ({ entries, stacked = false }: LinesProps) => (
  <Lines data-hook="declaration-lines">
    {entries.map((entry) => (
      <Line key={entry.name} code={declarationCode(entry, stacked)} />
    ))}
  </Lines>
)

type Props = {
  from: string
  to: string
}

export const TimeRangeDeclarations = ({ from, to }: Props) =>
  isValidTimeRange({ from, to }) ? (
    <DeclarationLines entries={timeRangeToDeclareEntries({ from, to })} />
  ) : null
