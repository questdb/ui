import { describe, expect, it } from "vitest"
import { mcpNotebookTelemetry } from "./mcpNotebookTelemetry"
const result = (data: unknown, isError = false) => ({
  content: [{ type: "text", text: JSON.stringify(data) }],
  isError,
})

describe("MCP notebook attribution", () => {
  it("uses the requested target, and the cell only once dispatch resolved it", () => {
    const args = { buffer_id: 12, cell_id: "custom.cell", sql: "private" }
    expect(mcpNotebookTelemetry("update_cell", args)).toEqual({
      notebookId: 12,
    })
    expect(mcpNotebookTelemetry("update_cell", args, result({}, true))).toEqual(
      { notebookId: 12 },
    )
    expect(mcpNotebookTelemetry("update_cell", args, result({}))).toEqual({
      notebookId: 12,
      cellId: "custom.cell",
    })
    expect(mcpNotebookTelemetry("update_cell", { buffer_id: "12" })).toEqual({})
    expect(mcpNotebookTelemetry("update_cell", { buffer_id: -1 })).toEqual({})
    expect(
      mcpNotebookTelemetry("run_query", {
        buffer_id: 12,
        cell_id: "ignored",
        query: "private",
      }),
    ).toEqual({})
    expect(mcpNotebookTelemetry("connected", { buffer_id: 12 })).toEqual({})
  })
  it("reads the created ID and both sides of a duplicate from the result", () => {
    expect(
      mcpNotebookTelemetry(
        "create_notebook",
        { label: "private" },
        result({ bufferId: 5, label: "private" }),
      ),
    ).toEqual({ notebookId: 5 })
    expect(
      mcpNotebookTelemetry(
        "duplicate_notebook",
        { buffer_id: 5 },
        result({ bufferId: 6 }),
      ),
    ).toEqual({ sourceNotebookId: 5, notebookId: 6 })
    expect(
      mcpNotebookTelemetry(
        "duplicate_notebook",
        { buffer_id: 5 },
        result({ bufferId: 6 }, true),
      ),
    ).toEqual({ sourceNotebookId: 5 })
    expect(
      mcpNotebookTelemetry(
        "duplicate_cell",
        { buffer_id: 5, cell_id: "old" },
        result({ cellId: "new" }),
      ),
    ).toEqual({ notebookId: 5, cellId: "old", newCellId: "new" })
  })
  it("does not mistake successful dispatch for successful SQL execution", () => {
    expect(
      mcpNotebookTelemetry(
        "run_cell",
        { buffer_id: 5, cell_id: "c" },
        result({ success: false, results: ["private SQL error"] }),
      ),
    ).toEqual({ notebookId: 5, cellId: "c", executionOutcome: "error" })
    expect(
      mcpNotebookTelemetry(
        "run_cell",
        { buffer_id: 5, cell_id: "c" },
        result({ success: true, unverified: true }),
      ),
    ).toMatchObject({ executionOutcome: "unverified" })
    expect(
      mcpNotebookTelemetry(
        "run_cell",
        { buffer_id: 5, cell_id: "c" },
        result({ ran: false, skipped: true }),
      ),
    ).toMatchObject({ executionOutcome: "skipped" })
    expect(
      mcpNotebookTelemetry(
        "add_cell",
        { buffer_id: 5, run: true },
        result({ cellId: "new", ran: true }),
      ),
    ).toEqual({ notebookId: 5, cellId: "new", executionOutcome: "success" })
  })
  it("extracts bounded per-cell run outcomes for bulk apply without exporting content", () => {
    expect(
      mcpNotebookTelemetry(
        "apply_notebook_state",
        { buffer_id: 5 },
        result({
          runs: [
            { cellId: "ok", success: true, results: ["private rows"] },
            { cellId: "failed", success: false, error: "private SQL" },
            { cellId: "skipped", success: false, skipped: true },
          ],
        }),
      ),
    ).toEqual({
      notebookId: 5,
      cellExecutions: [
        { cellId: "ok", outcome: "success" },
        { cellId: "failed", outcome: "error" },
        { cellId: "skipped", outcome: "skipped" },
      ],
    })
  })
})
