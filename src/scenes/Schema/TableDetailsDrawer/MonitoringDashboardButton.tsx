import React from "react"
import styled from "styled-components"
import { ArrowRightIcon, NotebookIcon } from "@phosphor-icons/react"
import { Button, Spinner } from "../../../components"
import { Section } from "./shared-styles"

const NotebookGlyph = styled(NotebookIcon)`
  flex-shrink: 0;
  color: ${({ theme }) => theme.color.statusInfo};
`

const Action = styled(Section)`
  padding-top: 1.5rem;
  padding-bottom: 1.5rem;
`

const ActionLabel = styled.span`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const Direction = styled(ArrowRightIcon)`
  flex-shrink: 0;
  color: ${({ theme }) => theme.color.contentSecondary};
`

// Takes the arrow's place while the dashboard is created and its first
// queries run, so the button keeps its size.
const Progress = styled(Spinner)`
  flex-shrink: 0;
  color: ${({ theme }) => theme.color.contentSecondary};
`

// A standard button, like the drawer's AI actions: its own width, at the
// start of the section, shrinking with an ellipsis only in a narrow panel.
const DashboardAction = styled(Button)`
  align-self: flex-start;
  max-width: 100%;
  gap: 0.8rem;

  &:disabled ${NotebookGlyph}, &:disabled ${Direction} {
    color: ${({ theme }) => theme.color.contentDisabled};
  }
`

// `busy` is an in-progress open; `disabled` covers reasons that are not
// progress (a script owns the tabs, table metadata is unavailable).
export const MonitoringDashboardButton = ({
  onClick,
  busy,
  disabled,
}: {
  onClick: () => void
  busy: boolean
  disabled: boolean
}) => (
  <Action>
    <DashboardAction
      variant="secondary"
      disabled={busy || disabled}
      aria-busy={busy}
      onClick={onClick}
      data-hook="table-details-monitoring-dashboard"
    >
      <NotebookGlyph size={16} aria-hidden="true" />
      <ActionLabel>Create monitoring dashboard</ActionLabel>
      {busy ? (
        <Progress
          size={16}
          aria-hidden="true"
          data-hook="table-details-monitoring-dashboard-progress"
        />
      ) : (
        <Direction size={16} aria-hidden="true" />
      )}
    </DashboardAction>
  </Action>
)
