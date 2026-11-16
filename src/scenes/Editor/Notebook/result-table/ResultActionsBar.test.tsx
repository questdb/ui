// @vitest-environment jsdom
import React from "react"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { renderComponent } from "../../../../test/component"
import type { DqlQueryResult } from "../../../../store/notebook"
import { ResultActionsBar } from "./ResultActionsBar"

vi.mock("../../../../modules/ConsoleEventTracker", () => ({
  trackEvent: vi.fn(),
}))

const variables = vi.hoisted(() => {
  // jsdom has no canvas: the grid measures text without it
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null)
  return { current: [] as Array<{ name: string; value: string }> }
})

vi.mock("../NotebookProvider", () => ({
  useNotebookActions: () => ({ getVariables: () => variables.current }),
}))

const resultOf = (query: string): DqlQueryResult => ({
  type: "dql",
  query,
  columns: [{ name: "sym", type: "SYMBOL" }],
  dataset: [["BTC-USD"]],
  count: 1,
})

const downloadAsCsv = async (query: string) => {
  renderComponent(
    <ResultActionsBar
      data={resultOf(query)}
      gridRef={{ current: null }}
      isFrozen={false}
      hasSelection={false}
    />,
  )
  await userEvent.click(screen.getByRole("button", { name: "Download result" }))
  await userEvent.click(
    await screen.findByRole("menuitem", { name: "Download as CSV" }),
  )
  return new URL(document.querySelector("iframe")!.src)
}

describe("ResultActionsBar download", () => {
  it("exports a cell result with the notebook variables it reads", async () => {
    // Given a notebook with a variable, and a cell result that reads it
    variables.current = [{ name: "sym", value: "'BTC-USD'" }]
    const query = "select @sym sym"

    // When the result is downloaded as CSV
    const url = await downloadAsCsv(query)

    // Then the export runs the statement as written, with the variables beside it
    expect(url.searchParams.get("query")).toBe(query)
    expect(url.searchParams.get("variables")).toBe("@sym := 'BTC-USD'")
  })
})
