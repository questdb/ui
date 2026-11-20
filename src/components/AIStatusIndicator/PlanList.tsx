import React from "react"
import styled, { useTheme } from "styled-components"
import {
  CheckCircleIcon,
  CircleHalfIcon,
  CircleIcon,
} from "@phosphor-icons/react"
import type { PlanEntry } from "../../providers/AIStatusProvider"

const List = styled.ol`
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  margin: 0;
  padding: 0.2rem 2.8rem 0.4rem;
  list-style: none;
`

const Entry = styled.li<{ $status: string }>`
  display: grid;
  grid-template-columns: 1.4rem minmax(0, 1fr);
  column-gap: 0.8rem;
  font-size: 1.3rem;
  line-height: 2rem;
  color: ${({ theme, $status }) =>
    $status === "in_progress"
      ? theme.color.contentPrimary
      : $status === "completed"
        ? theme.color.contentMuted
        : theme.color.contentSecondary};
  overflow-wrap: anywhere;
`

const Icon = styled.span`
  display: inline-flex;
  align-items: center;
  height: 2rem;
`

const STATUS_LABELS: Record<string, string> = {
  completed: "Done",
  in_progress: "In progress",
  pending: "To do",
}

// An agent's to-do list: what is done, what it is on, what is left.
export const PlanList = ({ entries }: { entries: PlanEntry[] }) => {
  const theme = useTheme()
  return (
    <List data-hook="assistant-mode-plan">
      {entries.map((entry, index) => (
        // eslint-disable-next-line react/no-array-index-key -- entries have no id; the list is replaced whole
        <Entry key={index} $status={entry.status}>
          <Icon aria-label={STATUS_LABELS[entry.status] ?? "To do"} role="img">
            {entry.status === "completed" ? (
              <CheckCircleIcon size={14} color={theme.color.contentMuted} />
            ) : entry.status === "in_progress" ? (
              <CircleHalfIcon size={14} color={theme.color.contentPrimary} />
            ) : (
              <CircleIcon size={14} color={theme.color.contentMuted} />
            )}
          </Icon>
          <span>{entry.content}</span>
        </Entry>
      ))}
    </List>
  )
}
