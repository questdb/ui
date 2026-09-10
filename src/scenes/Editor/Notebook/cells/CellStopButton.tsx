import React, { useEffect, useRef } from "react"
import { IconButton } from "../../../../components/IconButton"
import { Stop } from "../../../../components/icons"
import { trackEvent } from "../../../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../../../modules/ConsoleEventTracker/events"
import { useNotebookActions } from "../NotebookProvider"
import { useCellRefresh } from "../cellRefresh/CellRefreshContext"

type Props = {
  cellId: string
  view: "grid" | "chart"
  onUnmountWhileFocused: () => void
}

// Ends a cell's first run or first chart fetch. The button unmounts once the
// phase ends, so a keyboard user's focus is handed on instead of dropping to
// the document body.
export const CellStopButton: React.FC<Props> = ({
  cellId,
  view,
  onUnmountWhileFocused,
}) => {
  const { cancelCell } = useNotebookActions()
  const cellRefresh = useCellRefresh()
  const focusedRef = useRef(false)
  const onUnmountWhileFocusedRef = useRef(onUnmountWhileFocused)

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    void trackEvent(ConsoleEvent.NOTEBOOK_CELL_RUN_CANCEL, {
      scope: "cell",
      view,
    })
    if (view === "chart") {
      cellRefresh?.cancelChartFetch(cellId)
      return
    }
    cancelCell(cellId)
  }

  useEffect(() => {
    onUnmountWhileFocusedRef.current = onUnmountWhileFocused
  }, [onUnmountWhileFocused])

  useEffect(
    () => () => {
      if (focusedRef.current) onUnmountWhileFocusedRef.current()
    },
    [],
  )

  return (
    <IconButton
      label={view === "chart" ? "Stop chart loading" : "Stop run"}
      tooltip="Stop"
      variant="dangerGhost"
      onClick={handleClick}
      onFocus={() => {
        focusedRef.current = true
      }}
      onBlur={() => {
        focusedRef.current = false
      }}
      dataHook="cell-stop-button"
    >
      <Stop size="18px" />
    </IconButton>
  )
}
