import React from "react"
import { TimeRangePicker } from "../../TimeRangePicker"
import { useNotebookActions, useNotebookState } from "../NotebookProvider"
import { NOTEBOOK_TIME_PRESETS } from "./timeRange"
import { TimeRangeDeclarations } from "./TimeRangeDeclarations"

export const NotebookTimeRangeControl: React.FC = () => {
  const { settings } = useNotebookState()
  const { setTimeRange } = useNotebookActions()
  const range = settings.timeRange

  return (
    <TimeRangePicker
      dateFrom={range?.from}
      dateTo={range?.to}
      presets={NOTEBOOK_TIME_PRESETS}
      renderPreview={(from, to) => (
        <TimeRangeDeclarations from={from} to={to} />
      )}
      onApply={(from, to, signal, onProgress) =>
        setTimeRange({ from, to }, signal, (step) =>
          onProgress(
            step.kind === "committing"
              ? "Saving time range..."
              : `${step.kind === "fetching" ? "Loading values for" : "Validating"} @${step.name}...`,
            step.kind === "committing",
          ),
        )
      }
      onClear={(signal, onProgress) =>
        setTimeRange(null, signal, (step) =>
          onProgress(
            step.kind === "committing"
              ? "Saving time range..."
              : `Validating @${step.name}...`,
            step.kind === "committing",
          ),
        )
      }
      dataHook="notebook-time-range"
    />
  )
}
