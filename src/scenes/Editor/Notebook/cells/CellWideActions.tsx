import React from "react"
import { CellViewToggle } from "./CellViewToggle"
import { CellRefreshButton } from "./CellRefreshButton"
import type { AutoRefresh } from "../../../../store/notebook"

type Props = {
  cellId: string
  // Only the grid/chart views reach here — the neutral (none) state renders the
  // Run/Draw toggles instead.
  view: "grid" | "chart"
  cellAutoRefresh: AutoRefresh | undefined
  autoRefreshDefault: AutoRefresh | undefined
  isViewMaximized: boolean
  isRunning: boolean
  isGridLoading: boolean
  isChartLoading: boolean
  isChartRefreshing: boolean
  chartZoomed: boolean
}

export const CellWideActions: React.FC<Props> = ({
  cellId,
  view,
  cellAutoRefresh,
  autoRefreshDefault,
  isViewMaximized,
  isRunning,
  isGridLoading,
  isChartLoading,
  isChartRefreshing,
  chartZoomed,
}) => (
  <>
    {/* Hide the refresh control until the first result lands — while loading,
        the Run/Chart segment shows the spinner instead. */}
    {(view === "chart" ? !isChartLoading : !isGridLoading) && (
      <CellRefreshButton
        cellId={cellId}
        view={view}
        cellAutoRefresh={cellAutoRefresh}
        autoRefreshDefault={autoRefreshDefault}
        // A grid's first run spins the Run segment instead — only a true refresh
        // (re-running an existing grid) spins the refresh button.
        isRefreshing={
          view === "chart" ? isChartRefreshing : isRunning && !isGridLoading
        }
      />
    )}
    <CellViewToggle
      cellId={cellId}
      view={view}
      isViewMaximized={isViewMaximized}
      isGridLoading={isGridLoading}
      isChartLoading={isChartLoading}
      isRunning={isRunning}
      chartZoomed={chartZoomed}
      showLabels
    />
  </>
)
