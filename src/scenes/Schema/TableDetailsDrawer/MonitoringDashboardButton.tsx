import React from "react"
import styled from "styled-components"
import { ArrowRightIcon, NotebookIcon } from "@phosphor-icons/react"
import { Button } from "../../../components"
import { Section } from "./shared-styles"

const NotebookGlyph = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 3.2rem;
  height: 3.2rem;
  border-radius: 0.4rem;
  background: ${({ theme }) => theme.color.statusInfoSurface};
  color: ${({ theme }) => theme.color.statusInfo};
`

const Action = styled(Section)`
  padding-top: 1.5rem;
  padding-bottom: 1.5rem;
`

const ActionLabel = styled.span`
  flex: 1;
  min-width: 0;
  text-align: left;
  white-space: normal;
`

const Direction = styled(ArrowRightIcon)`
  flex-shrink: 0;
  color: ${({ theme }) => theme.color.contentSecondary};
`

const DashboardAction = styled(Button)`
  width: 100%;
  height: auto;
  min-height: 5.2rem;
  padding: 0.9rem 1.2rem;
  gap: 1.2rem;
  border-radius: 0.6rem;

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
      fontSize="md"
      disabled={busy || disabled}
      aria-busy={busy}
      onClick={onClick}
      data-hook="table-details-monitoring-dashboard"
    >
      <NotebookGlyph aria-hidden="true">
        <NotebookIcon size={20} />
      </NotebookGlyph>
      <ActionLabel>Create monitoring dashboard</ActionLabel>
      <Direction size={18} aria-hidden="true" />
    </DashboardAction>
  </Action>
)
