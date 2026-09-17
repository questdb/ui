import React from "react"
import styled from "styled-components"
import { ClockIcon } from "@phosphor-icons/react"
import { ButtonBase } from "../../../../../components"
import type { NotebookCell } from "../../../../../store/notebook"
import { describeCellTime } from "../../variables/cellTime"
import { NOTEBOOK_TIME_PRESETS } from "../../variables/timeRange"

const LinkButton = styled(ButtonBase)`
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0 0.2rem;
  border: none;
  background: none;
  color: ${({ theme }) => theme.color.statusInfo};
  font-size: ${({ theme }) => theme.fontSize.md};
  font-weight: 600;
  white-space: nowrap;

  svg {
    flex-shrink: 0;
  }

  &:hover,
  &:focus-visible {
    text-decoration: underline;
  }
`

const Summary = styled.span`
  overflow: hidden;
  font-weight: 400;
  text-overflow: ellipsis;
`

type Props = {
  cell: NotebookCell
  onClick: () => void
}

export const CellTimeControl = ({ cell, onClick }: Props) => {
  const summary = describeCellTime(cell, NOTEBOOK_TIME_PRESETS)
  if (!summary || !cell.showTimeRange) return null
  return (
    <LinkButton
      aria-label={`Cell time range: ${summary}`}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      data-hook="cell-time-control"
    >
      <ClockIcon size={18} />
      <Summary>{summary}</Summary>
    </LinkButton>
  )
}
