import isEqual from "lodash.isequal"
import type { Buffer } from "../../store/buffers"
import type { NotebookViewState } from "../../store/notebook"

// Compare authored content, not execution/inspection state. A first result,
// editor auto-sizing, a cursor move or opening SQL must not adopt an example.
// Grid heights and absolute y positions are recomputed by the layout engine;
// row membership/order and column widths express the user's layout instead.
const authoredContent = (view: NotebookViewState) => {
  const ids = new Set(view.cells.map((cell) => cell.id))
  const layout = (view.settings?.layout ?? []).filter((item) => ids.has(item.i))
  const rows = [...new Set(layout.map((item) => item.y))].sort((a, b) => a - b)
  return {
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
    layoutMode: view.settings?.layoutMode ?? "list",
    variables: view.settings?.variables ?? [],
    autoRefreshDefault: view.settings?.autoRefreshDefault,
    layout: layout
      .map((item) => ({
        i: item.i,
        x: item.x,
        w: item.w,
        row: rows.indexOf(item.y),
      }))
      .sort((a, b) => a.i.localeCompare(b.i)),
  }
}

export const examplePersonalizationReason = (
  before: Buffer,
  update: Partial<Buffer>,
): "rename" | "content" | undefined => {
  if (before.templateId === undefined || "templateId" in update) return
  if (update.label !== undefined && update.label !== before.label)
    return "rename"
  if (
    before.notebookViewState &&
    update.notebookViewState &&
    !isEqual(
      authoredContent(before.notebookViewState),
      authoredContent(update.notebookViewState),
    )
  )
    return "content"
}
