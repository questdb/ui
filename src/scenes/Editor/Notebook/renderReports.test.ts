// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest"
import type { NotebookCell } from "../../../store/notebook"
import { serializeCell } from "../../../utils/ai/notebookSnapshot"
import {
  clearRenderReport,
  DRAWN_NEEDS_READ,
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

  it("withholds what was drawn, not the problems, from a reader not allowed results", () => {
    // Given a gauge that drew a result value, with a problem about its columns
    const problems = [
      {
        message: 'column "v" is not in the result',
        severity: "error" as const,
      },
    ]
    setRenderReport(BUFFER_ID, cell.id, { kind: "visual", drawn, problems })

    // When an agent without the 'read' permission reads the cell
    const report = getCell(cell, false)

    // Then it sees the problems and why `drawn` is withheld, not the value
    expect(report).toMatchObject({
      kind: "visual",
      drawn_withheld: DRAWN_NEEDS_READ,
      problems,
    })
    expect(report).not.toHaveProperty("drawn")
    expect(JSON.stringify(report)).not.toContain("987654")
  })

  it("has no report for a cell that has not drawn", () => {
    // Given a draw cell and a SQL cell that have not drawn since the page loaded
    // When an agent reads them, with or without 'read'
    // Then neither carries a report
    const sqlCell: NotebookCell = { ...cell, mode: undefined }
    for (const target of [cell, sqlCell])
      for (const canRead of [true, false])
        expect(getCell(target, canRead)).toBeUndefined()
  })
})
