// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest"
import type { NotebookCell } from "../../../store/notebook"
import { serializeCell } from "../../../utils/ai/notebookSnapshot"
import {
  clearRenderReport,
  getRenderReport,
  renderReportWire,
  setRenderReport,
} from "./renderReports"

const BUFFER_ID = 7

const cell: NotebookCell = {
  id: "c1",
  position: 0,
  value: "SELECT salary FROM payroll LIMIT 1",
  mode: "draw",
}

afterEach(() => clearRenderReport(BUFFER_ID, cell.id))

describe("render report on the agent wire", () => {
  it.each([
    [
      "a gauge's value",
      { type: "gauge", value: 987654.321, min: 0, max: 987654.321, bands: 2 },
      { type: "gauge", bands: 2 },
    ],
    [
      "a volume profile's point of control",
      { type: "volumeProfile", levels: 3, pointOfControl: "101.5" },
      { type: "volumeProfile", levels: 3 },
    ],
    [
      "a liquidity heatmap's steps",
      { type: "liquidityHeatmap", cells: 12, timeStep: 60000, priceStep: 0.5 },
      { type: "liquidityHeatmap", cells: 12 },
    ],
  ])("keeps %s out of get_cell", (_label, drawn, shape) => {
    // Given a visual that drew result values
    setRenderReport(BUFFER_ID, cell.id, {
      kind: "visual",
      drawn,
      problems: [],
    })

    // When an agent reads the cell, which never carries query result data
    const report = serializeCell(
      [cell],
      cell.id,
      BUFFER_ID,
      false,
      undefined,
      "loaded",
    ).render_report

    // Then it learns what was drawn, not the values
    expect(report?.drawn).toEqual(shape)

    // And a reader allowed to see results (get_cell_image) still gets them
    const stored = getRenderReport(BUFFER_ID, cell.id)
    if (!stored) throw new Error("no report")
    expect(renderReportWire(stored, true).drawn).toEqual(drawn)
  })
})
