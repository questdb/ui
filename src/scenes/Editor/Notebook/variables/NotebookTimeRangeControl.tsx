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
      onApply={(from, to) => setTimeRange({ from, to })}
      onClear={() => setTimeRange(null)}
      dataHook="notebook-time-range"
    />
  )
}
