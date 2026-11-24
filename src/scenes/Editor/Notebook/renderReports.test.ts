// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest"
import type { NotebookCell } from "../../../store/notebook"
import { serializeCell } from "../../../utils/ai/notebookSnapshot"
import {
  clearRenderReport,
  RENDER_REPORT_NEEDS_READ,
  setRenderReport,
} from "./renderReports"

const BUFFER_ID = 7

const cell: NotebookCell = {
  id: "c1",
  position: 0,
  value: "SELECT salary FROM payroll LIMIT 1",
  mode: "draw",
}

const getCell = (target: NotebookCell, canReadResults: boolean) =>
  serializeCell(
    [target],
    target.id,
    BUFFER_ID,
    false,
    undefined,
    "loaded",
    canReadResults,
  ).render_report

afterEach(() => clearRenderReport(BUFFER_ID, cell.id))

describe("render report on the agent wire", () => {
  const drawn = { type: "gauge", value: 987654.321, min: 0, max: 1e6 }

  it("gives a reader allowed results the whole report", () => {
    // Given a gauge that drew a result value
    setRenderReport(BUFFER_ID, cell.id, {
      kind: "visual",
      drawn,
      problems: [],
    })

    // When an agent with the 'read' permission reads the cell
    const report = getCell(cell, true)

    // Then it sees what was drawn, values included
    expect(report).toMatchObject({ kind: "visual", drawn, problems: [] })
  })

  it("withholds the report from a reader not allowed results", () => {
    // Given a gauge that drew a result value
    setRenderReport(BUFFER_ID, cell.id, {
      kind: "visual",
      drawn,
      problems: [
        { message: "value 987654.321 above max", severity: "warning" },
      ],
    })

    // When an agent without the 'read' permission reads the cell
    const report = getCell(cell, false)

    // Then it learns only why the report is withheld
    expect(report).toEqual({ withheld: RENDER_REPORT_NEEDS_READ })
    expect(JSON.stringify(report)).not.toContain("987654")
  })

  it("tells a reader not allowed results why a draw cell has no report", () => {
    // Given a draw cell that has not drawn since the page loaded
    // When an agent without the 'read' permission reads it
    // Then it is told that the report needs 'read'
    expect(getCell(cell, false)).toEqual({ withheld: RENDER_REPORT_NEEDS_READ })

    // And a SQL cell carries no report either way
    const sqlCell: NotebookCell = { ...cell, mode: undefined }
    expect(getCell(sqlCell, false)).toBeUndefined()
    expect(getCell(sqlCell, true)).toBeUndefined()
  })
})
