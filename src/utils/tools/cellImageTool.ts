import type { EChartsType } from "echarts"
import type { NotebookCell } from "../../store/notebook"
import { NotebookToolError } from "../notebooks/notebookToolError"
import type { RenderReport } from "../../scenes/Editor/Notebook/renderReports"
import { renderReportWire } from "../../scenes/Editor/Notebook/renderReports"
import { HTML_VISUAL_TYPES } from "../../scenes/Editor/Notebook/visuals/visualCatalog"
import type { CellChartPicture } from "../../scenes/Editor/Notebook/cellChartImages"

// get_cell_image: a PNG of a draw cell's chart as it is on screen, with the
// cell's render report. The notebook must be open in the console; a cell
// scrolled away is brought into view for the picture and the user's scroll
// put back. Components drawn in HTML have no picture.

export const denyReasonForCellImage = (): string =>
  "PERMISSION_DENIED: a picture of a chart shows query results, so " +
  "get_cell_image needs the 'read' permission. Ask the user to grant it in " +
  "the QuestDB console (footer → MCP popover or AI Assistant settings)."

/** What the tool reads and does in the page; tests pass their own. */
export type CellImageDeps = {
  readCells: (bufferId: number, signal?: AbortSignal) => Promise<NotebookCell[]>
  // The open notebook's view, or null when it is not open in the console.
  liveView: (
    bufferId: number,
  ) => Promise<{ maximizedCellId: string | null } | null>
  chartOf: (bufferId: number, cellId: string) => EChartsType | null
  // Brings a cell into view; returns a function that puts the scroll back.
  bringIntoView: (cellId: string) => () => void
  waitForChart: (
    bufferId: number,
    cellId: string,
    signal?: AbortSignal,
  ) => Promise<EChartsType | null>
  // Resolves once a chart that just mounted has finished animating in.
  settle: (instance: EChartsType, signal?: AbortSignal) => Promise<void>
  picture: (instance: EChartsType) => CellChartPicture | null
  reportOf: (bufferId: number, cellId: string) => RenderReport | undefined
}

export type CellImageResult = {
  body: Record<string, unknown>
  picture: CellChartPicture | null
}

export const cellImage = async (
  bufferId: number,
  cellId: string,
  deps: CellImageDeps,
  signal?: AbortSignal,
): Promise<CellImageResult> => {
  const cell = (await deps.readCells(bufferId, signal)).find(
    (c) => c.id === cellId,
  )
  if (!cell)
    throw new NotebookToolError(
      "unknown_cell",
      `Cell ${cellId} not found in notebook ${bufferId}.`,
    )
  if (cell.type === "markdown" || cell.mode !== "draw")
    throw new NotebookToolError(
      "validation",
      "Only draw cells have a chart to picture: set_cell_mode with mode 'draw' first.",
    )
  // Read when answering: a cell scrolled into view reports once drawn.
  const report = () => {
    const r = deps.reportOf(bufferId, cellId)
    return r ? { render_report: renderReportWire(r) } : {}
  }
  const visual = cell.chartConfig?.visual
  if (visual && HTML_VISUAL_TYPES.has(visual.type))
    return {
      body: {
        picture: false,
        reason: `The ${visual.type} component is drawn in HTML, not as a chart, so there is no picture. Its render_report says what it drew.`,
        ...report(),
      },
      picture: null,
    }
  const live = await deps.liveView(bufferId)
  if (!live)
    throw new NotebookToolError(
      "validation",
      "The notebook is not open in the console, so nothing is drawn: activate_notebook first.",
    )
  if (live.maximizedCellId !== null && live.maximizedCellId !== cellId)
    throw new NotebookToolError(
      "validation",
      `Cell ${live.maximizedCellId} is maximized, so no other cell is drawn: set_cell_maximized with cell_id null first.`,
    )

  let instance = deps.chartOf(bufferId, cellId)
  let restoreScroll = () => undefined as void
  try {
    const justDrawn = !instance
    if (!instance) {
      // Cells away from the viewport are not drawn; bring this one in.
      restoreScroll = deps.bringIntoView(cellId)
      instance = await deps.waitForChart(bufferId, cellId, signal)
    }
    if (!instance)
      return {
        body: {
          picture: false,
          reason:
            "The cell draws no chart right now: it may have no results yet (run_cell), or nothing to draw. Its render_report says why.",
          ...report(),
        },
        picture: null,
      }
    if (justDrawn) await deps.settle(instance, signal)
    const picture = deps.picture(instance)
    if (!picture)
      return {
        body: {
          picture: false,
          reason:
            "The picture is too large to send. Make the cell smaller (set_cell_dimensions) and ask again.",
          ...report(),
        },
        picture: null,
      }
    return {
      body: {
        picture: true,
        width: picture.width,
        height: picture.height,
        ...report(),
      },
      picture,
    }
  } finally {
    restoreScroll()
  }
}
