import type { EChartsType } from "echarts"
import isEqual from "lodash.isequal"
import type { NotebookCell } from "../../store/notebook"
import { NotebookToolError } from "../notebooks/notebookToolError"
import type { RenderReport } from "../../scenes/Editor/Notebook/renderReports"
import { renderReportWire } from "../../scenes/Editor/Notebook/renderReports"
import { HTML_VISUAL_TYPES } from "../../scenes/Editor/Notebook/visuals/visualCatalog"
import {
  waitForCellDraw,
  type CellChartPicture,
} from "../../scenes/Editor/Notebook/cellChartImages"

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
    return r ? { render_report: renderReportWire(r, true) } : {}
  }
  const visual = cell.chartConfig?.visual
  if (visual && HTML_VISUAL_TYPES.has(visual.type)) {
    const reportForVisual = () => {
      const current = deps.reportOf(bufferId, cellId)
      return current?.kind === "visual" &&
        current.drawn.type === visual.type &&
        isEqual(current.visualConfig, visual)
        ? current
        : undefined
    }
    // A pending draw ("waiting") is worth waiting for; if it does not end in
    // time, the agent reads that the draw is still pending.
    const settledReport = () => {
      const current = reportForVisual()
      return current?.status === "waiting" ? undefined : current
    }
    let current = settledReport()
    if (!current) {
      const view = await deps.liveView(bufferId)
      if (
        view &&
        (view.maximizedCellId === null || view.maximizedCellId === cellId)
      ) {
        const restore = deps.bringIntoView(cellId)
        try {
          current =
            (await waitForCellDraw(settledReport, 4000, signal)) ?? undefined
        } finally {
          restore()
        }
      }
      current ??= reportForVisual()
    }
    return {
      body: {
        picture: false,
        reason: `The ${visual.type} component is drawn in HTML, not as a chart, so there is no picture.`,
        ...(current
          ? { render_report: renderReportWire(current, true) }
          : {
              report_status:
                "The component has not reported a draw in the console.",
            }),
      },
      picture: null,
    }
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
    const notDrawn = () => ({
      body: {
        picture: false,
        reason:
          "The cell draws no chart right now: it may have no results yet (run_cell), or nothing to draw. Its render_report says why.",
        ...report(),
      },
      picture: null,
    })
    if (!instance) return notDrawn()
    if (justDrawn) await deps.settle(instance, signal)
    // The chart can be replaced while it settles (a theme change, a new
    // option, the cell scrolled away again).
    if (instance.isDisposed?.()) return notDrawn()
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
