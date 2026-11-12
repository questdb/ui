import type { NotebookCell, NotebookSettings } from "../../../../store/notebook"
import type { PastedCell } from "../../../../utils/notebooks/notebookController"
import type { RunStatus } from "../../../../utils/ai/runStatus"
import { hasRunMarker } from "../resultHydration/cellResultHydration"
import { carriedRunError, carriedRunStatus } from "../runHistory"
import {
  sanitizeNotebookCell,
  validateNotebookCell,
} from "../notebookCellSanitizer"

export const CELL_CLIPBOARD_MIME = "application/x-questdb-notebook-cells"

const PAYLOAD_FORMAT = "questdb.notebook.cells"
const PAYLOAD_VERSION = 1

export type CellClipboardPayload = {
  cells: PastedCell[]
}

// The run history stays, as in a page reload: it tells the paste to fetch
// the rows again.
const toCopiedCell = (cell: NotebookCell): NotebookCell => {
  const { result: _result, editorViewState: _editorViewState, ...copied } = cell
  return {
    ...copied,
    lastRunStatus: carriedRunStatus(cell),
    lastRunError: carriedRunError(cell),
  }
}

export const shouldRunAfterPaste = (cell: NotebookCell): boolean =>
  cell.type !== "markdown" && cell.mode !== "draw" && hasRunMarker(cell)

export const buildCellClipboardPayload = (
  cells: NotebookCell[],
  settings: NotebookSettings,
): CellClipboardPayload => {
  const gridWidthOf = (cellId: string) =>
    settings.layoutMode === "grid"
      ? settings.layout?.find((item) => item.i === cellId)?.w
      : undefined
  return {
    cells: cells.map((cell) => ({
      cell: toCopiedCell(cell),
      gridWidth: gridWidthOf(cell.id),
    })),
  }
}

export const serializeCellClipboardPayload = (
  payload: CellClipboardPayload,
): string =>
  JSON.stringify({
    format: PAYLOAD_FORMAT,
    version: PAYLOAD_VERSION,
    cells: payload.cells,
  })

export const cellClipboardPlainText = (payload: CellClipboardPayload): string =>
  payload.cells.map(({ cell }) => cell.value).join("\n\n")

const PASTED_RUN_STATUSES: RunStatus[] = ["success", "error", "cancelled"]

const parseRunHistory = (
  cell: Record<string, unknown>,
): Pick<NotebookCell, "lastRunStatus" | "lastRunError"> => {
  const status = PASTED_RUN_STATUSES.find((s) => s === cell.lastRunStatus)
  if (!status) return {}
  return typeof cell.lastRunError === "string"
    ? { lastRunStatus: status, lastRunError: cell.lastRunError }
    : { lastRunStatus: status }
}

const parsePastedCell = (item: unknown, index: number): PastedCell | null => {
  if (typeof item !== "object" || item === null) return null
  const { cell, gridWidth } = item as Record<string, unknown>
  if (validateNotebookCell(cell, index) !== true) return null
  const raw = cell as Record<string, unknown>
  return {
    cell: { ...sanitizeNotebookCell(raw, index), ...parseRunHistory(raw) },
    gridWidth:
      typeof gridWidth === "number" &&
      Number.isInteger(gridWidth) &&
      gridWidth > 0
        ? gridWidth
        : undefined,
  }
}

const parseJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export const parseCellClipboardPayload = (
  raw: string,
): CellClipboardPayload | null => {
  const parsed = parseJson(raw)
  if (typeof parsed !== "object" || parsed === null) return null
  const { format, version, cells } = parsed as Record<string, unknown>
  if (format !== PAYLOAD_FORMAT || version !== PAYLOAD_VERSION) return null
  if (!Array.isArray(cells) || cells.length === 0) return null
  const pastedCells = cells.map(parsePastedCell)
  if (pastedCells.some((cell) => cell === null)) return null
  return {
    cells: pastedCells as PastedCell[],
  }
}
