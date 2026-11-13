import { describe, it, expect } from "vitest"
import type { NotebookCell, NotebookSettings } from "../../../../store/notebook"
import {
  buildCellClipboardPayload,
  parseCellClipboardPayload,
  serializeCellClipboardPayload,
  shouldRunAfterPaste,
} from "./cellClipboardPayload"

const sqlCell = (overrides: Partial<NotebookCell> = {}): NotebookCell => ({
  id: "source",
  position: 3,
  value: "SELECT * FROM trades",
  paneView: "editor_result",
  ...overrides,
})

const roundTrip = (cells: NotebookCell[], settings: NotebookSettings = {}) =>
  parseCellClipboardPayload(
    serializeCellClipboardPayload(buildCellClipboardPayload(cells, settings)),
  )

describe("cell clipboard payload", () => {
  it("carries the cell configuration and run history, but not the rows", () => {
    // Given a drawn cell with a result and run history
    const cell = sqlCell({
      name: "Trades",
      mode: "draw",
      autoRefresh: "5s",
      paneView: "result",
      chartConfig: { xColumn: "ts", queries: [{ type: "line", yColumns: [] }] },
      result: { results: [], activeResultIndex: 0, timestamp: 1 },
      lastRunStatus: "error",
      lastRunError: "boom",
    })

    // When the cell goes through the clipboard
    const payload = roundTrip([cell])

    // Then everything but the result survives
    const pasted = payload?.cells[0].cell
    expect(pasted).toMatchObject({
      value: "SELECT * FROM trades",
      name: "Trades",
      mode: "draw",
      autoRefresh: "5s",
      paneView: "result",
      chartConfig: { xColumn: "ts" },
      lastRunStatus: "error",
      lastRunError: "boom",
    })
    expect(pasted).not.toHaveProperty("result")
  })

  it("derives the run history of a cell that only holds a result", () => {
    // Given a table cell whose result predates run history stamping
    const cell = sqlCell({
      result: {
        results: [
          {
            type: "dql",
            query: "SELECT 1",
            columns: [],
            dataset: [],
            count: 0,
          },
        ],
        activeResultIndex: 0,
        timestamp: 1,
      },
    })

    // When the cell goes through the clipboard
    const pasted = roundTrip([cell])?.cells[0].cell

    // Then the paste knows the cell ran
    expect(pasted?.lastRunStatus).toBe("success")
    expect(pasted && shouldRunAfterPaste(pasted)).toBe(true)
  })

  it.each([
    ["a table cell that ran", { lastRunStatus: "success" }, true],
    ["a table cell that failed", { lastRunStatus: "error" }, true],
    ["a cell that never ran", {}, false],
    [
      "a chart, which fetches by itself",
      { mode: "draw", lastRunStatus: "success" },
      false,
    ],
    ["a markdown cell", { type: "markdown", lastRunStatus: "success" }, false],
  ] as const)("runs %s after paste: %s", (_, overrides, expected) => {
    expect(shouldRunAfterPaste(sqlCell(overrides))).toBe(expected)
  })

  it("carries the grid width only from a grid notebook", () => {
    // Given the same layout in a grid and in a list notebook
    const layout = [{ i: "source", x: 0, y: 0, w: 6, h: 30 }]

    // When the cell goes through the clipboard from each notebook
    const fromGrid = roundTrip([sqlCell()], { layoutMode: "grid", layout })
    const fromList = roundTrip([sqlCell()], { layoutMode: "list", layout })

    // Then only the grid notebook gives a width
    expect(fromGrid?.cells[0].gridWidth).toBe(6)
    expect(fromList?.cells[0].gridWidth).toBeUndefined()
  })

  it("leaves variable definitions and values out of the clipboard", () => {
    // Given a cell that uses @to, and @to depends on @from
    const cell = sqlCell({ value: "SELECT * FROM trades WHERE ts < @to" })
    const settings: NotebookSettings = {
      variables: [
        { name: "from", value: "now()" },
        { name: "unused", value: "1" },
        { name: "to", value: "@from + 1d" },
        { name: "top", value: "10" },
      ],
    }

    // When the cell goes through the clipboard
    const payload = roundTrip([cell], settings)

    // Then only the cell travels, with its references unchanged
    expect(payload).not.toHaveProperty("variables")
    expect(payload?.cells[0].cell.value).toBe(cell.value)
    const serialized = serializeCellClipboardPayload(
      buildCellClipboardPayload([cell], settings),
    )
    expect(serialized).not.toContain("now()")
    expect(serialized).not.toContain("variables")
  })

  it("does not take variables for a markdown cell", () => {
    // Given a markdown cell that mentions a variable name
    const cell = sqlCell({ type: "markdown", value: "Uses @from" })
    const settings = { variables: [{ name: "from", value: "now()" }] }

    // When the cell goes through the clipboard
    const payload = roundTrip([cell], settings)

    // Then no variable travels with it
    expect(payload).not.toHaveProperty("variables")
  })

  it("ignores variables in an older clipboard payload", () => {
    const serialized = serializeCellClipboardPayload(
      buildCellClipboardPayload([sqlCell()], {}),
    )
    const payload = parseCellClipboardPayload(
      JSON.stringify({
        ...JSON.parse(serialized),
        variables: [{ name: "bad", value: "(SELECT * FROM missing_table)" }],
      }),
    )
    expect(payload?.cells).toHaveLength(1)
    expect(payload).not.toHaveProperty("variables")
  })

  it.each([
    ["plain text", "SELECT 1"],
    ["an unknown format", JSON.stringify({ format: "other", version: 1 })],
    [
      "a malformed cell",
      JSON.stringify({
        format: "questdb.notebook.cells",
        version: 1,
        cells: [{ cell: { id: "a", value: 42 } }],
        variables: [],
      }),
    ],
  ])("rejects %s", (_, raw) => {
    // When foreign clipboard content is parsed
    const payload = parseCellClipboardPayload(raw)

    // Then it is not taken as cells
    expect(payload).toBeNull()
  })
})
