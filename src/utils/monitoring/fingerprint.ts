import { sha256 } from "js-sha256"
import type { Buffer } from "../../store/buffers"
import type { NotebookViewState } from "../../store/notebook"

// Runtime results, pane inspection and automatic layout compaction are not
// customization. Keep authored content and relative row membership instead.
export const monitoringFingerprint = (
  label: string,
  view: NotebookViewState,
): string => {
  const layout = view.settings?.layout ?? []
  const rows = [...new Set(layout.map((item) => item.y))].sort((a, b) => a - b)
  return sha256(
    JSON.stringify({
      label,
      cells: view.cells.map((cell) => ({
        id: cell.id,
        value: cell.value,
        name: cell.name ?? "",
        type: cell.type ?? "sql",
        mode: cell.mode ?? "run",
        chartConfig: cell.chartConfig,
        highlightConfig: cell.highlightConfig,
        autoRefresh: cell.autoRefresh,
        topHeight: cell.topResized ? cell.topHeight : undefined,
        bottomHeight: cell.bottomResized ? cell.bottomHeight : undefined,
      })),
      variables: view.settings?.variables ?? [],
      autoRefreshDefault: view.settings?.autoRefreshDefault,
      layoutMode: view.settings?.layoutMode ?? "list",
      layout: layout
        .map(({ i, x, y, w }) => ({ i, x, w, row: rows.indexOf(y) }))
        .sort((a, b) => a.i.localeCompare(b.i)),
    }),
  )
}

export const isUnmodifiedMonitoring = (
  buffer: Buffer,
  view = buffer.notebookViewState,
): boolean =>
  !!buffer.monitoring &&
  !!view &&
  buffer.monitoring.initialFingerprint ===
    monitoringFingerprint(buffer.label, view)
