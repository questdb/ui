import type { CellPaneLayout } from "./notebookUtils"

export type LiveCellPresentation = {
  compact: boolean
  paneLayout: CellPaneLayout
  // Mirrors the renderer's hydration-aware result reservation. Persisted cell
  // state alone cannot distinguish a result that is still loading/released
  // from one whose snapshot is known to be missing.
  expectingResult: boolean
}

const presentations = new Map<
  number,
  Map<string, { token: symbol; value: LiveCellPresentation }>
>()

// Presentation is deliberately runtime-only: resizing a browser window must
// not rewrite the notebook document. Live AI/MCP reads still need the exact
// pane currently on screen, so mounted cells publish it here.
export const publishLiveCellPresentation = (
  bufferId: number,
  cellId: string,
  value: LiveCellPresentation,
): (() => void) => {
  const token = Symbol(cellId)
  const cells =
    presentations.get(bufferId) ??
    new Map<string, { token: symbol; value: LiveCellPresentation }>()
  cells.set(cellId, { token, value })
  presentations.set(bufferId, cells)

  return () => {
    const current = presentations.get(bufferId)?.get(cellId)
    if (current?.token !== token) return
    cells.delete(cellId)
    if (cells.size === 0) presentations.delete(bufferId)
  }
}

export const readLiveCellPresentation = (
  bufferId: number,
  cellId: string,
): LiveCellPresentation | undefined =>
  presentations.get(bufferId)?.get(cellId)?.value

const gridContainerWidths = new Map<number, number>()

// Tool mutations resolve the tier a new grid.w produces from the same
// measured container width as the renderer, published once per notebook.
export const publishGridContainerWidth = (
  bufferId: number,
  width: number,
): (() => void) => {
  gridContainerWidths.set(bufferId, width)
  return () => {
    if (gridContainerWidths.get(bufferId) === width) {
      gridContainerWidths.delete(bufferId)
    }
  }
}

export const readGridContainerWidth = (bufferId: number): number | undefined =>
  gridContainerWidths.get(bufferId)

export const __resetNotebookPresentationStoreForTests = (): void => {
  presentations.clear()
  gridContainerWidths.clear()
}
