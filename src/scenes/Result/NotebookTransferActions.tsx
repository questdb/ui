import React from "react"
import styled from "styled-components"
import { NotebookIcon, ArrowClockwiseIcon } from "@phosphor-icons/react"
import { Button } from "../../components"
import {
  useNotebookTransfer,
  type NotebookTransferRequest,
} from "../../hooks/useNotebookTransfer"

const Group = styled.div`
  display: flex;
  align-items: center;
  flex-shrink: 0;
  padding: 0 0.5rem;
  border-left: 1px solid ${({ theme }) => theme.color.borderSubtle};
  white-space: nowrap;
`

const NotebookGlyph = styled(NotebookIcon)`
  color: ${({ theme }) => theme.color.statusInfo};
`

export const NotebookTransferActions: React.FC<{
  request?: NotebookTransferRequest
  chart: boolean
  compact: boolean
  showMonitor: boolean
}> = ({ request, chart, compact, showMonitor }) => {
  const { transfer, busy } = useNotebookTransfer()
  const label = showMonitor
    ? "Auto-refresh in a notebook"
    : chart
      ? "Save chart to notebook"
      : "Add query to notebook"
  const compactLabel = showMonitor
    ? "Auto-refresh"
    : chart
      ? "Save chart"
      : "Add query"

  return (
    <Group>
      <Button
        variant="secondary"
        disabled={!request || busy}
        aria-label={label}
        title={compact ? label : undefined}
        leadingIcon={
          showMonitor ? (
            <ArrowClockwiseIcon size={18} />
          ) : (
            <NotebookGlyph size={18} />
          )
        }
        data-hook={
          showMonitor ? "result-auto-refresh-notebook" : "result-add-notebook"
        }
        onClick={() => {
          if (!request || busy) return
          void transfer({
            ...request,
            target: undefined,
            monitor: showMonitor,
            source: showMonitor ? "result_monitor" : request.source,
          })
        }}
      >
        {compact ? compactLabel : label}
      </Button>
    </Group>
  )
}
