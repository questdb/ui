import React from "react"
import { NotebookIcon } from "@phosphor-icons/react"
import {
  useNotebookTransfer,
  type NotebookTransferRequest,
} from "../../hooks/useNotebookTransfer"
import {
  NotebookActionIcon,
  ResultToolbarAction,
  type ResultActionDensity,
} from "./ResultToolbarAction"

export const NotebookTransferActions: React.FC<{
  request?: NotebookTransferRequest
  chart: boolean
  density: ResultActionDensity
  showMonitor: boolean
}> = ({ request, chart, density, showMonitor }) => {
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
    <ResultToolbarAction
      density={density}
      label={label}
      compactLabel={compactLabel}
      icon={
        <NotebookActionIcon>
          <NotebookIcon size={18} />
        </NotebookActionIcon>
      }
      disabled={!request}
      busy={busy}
      data-hook={
        showMonitor ? "result-auto-refresh-notebook" : "result-add-notebook"
      }
      onClick={() => {
        if (!request || busy) return
        void transfer({
          ...request,
          monitor: showMonitor,
          source: showMonitor ? "result_monitor" : request.source,
        })
      }}
    />
  )
}
