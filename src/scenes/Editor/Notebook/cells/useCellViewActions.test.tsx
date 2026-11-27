// @vitest-environment jsdom
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { renderComponent } from "../../../../test/component"
import { EventType } from "../../../../modules/EventBus/types"
import type { CellView } from "../notebookUtils"
import { useCellViewActions } from "./useCellViewActions"

const publish = vi.hoisted(() => vi.fn())

vi.mock("../../../../modules/EventBus", () => ({
  eventBus: { publish },
}))

const actions = vi.hoisted(() => ({
  setCellPaneView: vi.fn(),
  setCellMode: vi.fn(),
  clearCellResult: vi.fn(),
}))

vi.mock("../NotebookProvider", () => ({
  useNotebookActions: () => actions,
  useNotebookBufferId: () => 1,
}))

const probe: { actions?: ReturnType<typeof useCellViewActions> } = {}

const ViewActions = ({ view, busy }: { view: CellView; busy?: boolean }) => {
  probe.actions = useCellViewActions({
    cellId: "a",
    view,
    paneLayout: "split",
    isCellBusy: busy ?? false,
    method: "toggle",
  })
  return null
}

const renderWith = (view: CellView, busy?: boolean) => {
  renderComponent(<ViewActions view={view} busy={busy} />)
  return probe.actions!
}

describe("useCellViewActions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("keeps the results when the table already shows is chosen again", () => {
    // Given a cell that shows its table
    const { viewTable } = renderWith("grid")
    // When Table is chosen again
    viewTable()
    // Then nothing changes
    expect(actions.clearCellResult).not.toHaveBeenCalled()
    expect(actions.setCellMode).not.toHaveBeenCalled()
    expect(publish).not.toHaveBeenCalled()
  })

  it("keeps the chart when the chart already shows is chosen again", () => {
    // Given a cell that shows its chart
    const { viewChart } = renderWith("chart")
    // When Chart is chosen again
    viewChart()
    // Then the draw toggle does not fire, so the chart stays
    expect(publish).not.toHaveBeenCalled()
    expect(actions.clearCellResult).not.toHaveBeenCalled()
  })

  it("still switches between the table and the chart", () => {
    // Given a cell that shows its chart, Table switches to the table
    renderWith("chart").viewTable()
    expect(actions.setCellMode).toHaveBeenCalledWith("a", "run")
    // And given a cell that shows its table, Chart starts drawing
    renderWith("grid").viewChart()
    expect(publish).toHaveBeenCalledWith(EventType.NOTEBOOK_CELL_DRAW, {
      cellId: "a",
    })
  })

  it("closes a table by clearing its results", () => {
    // Given a cell that shows its table
    // When its results are closed
    renderWith("grid").closeResults()
    // Then the result is cleared, as a second click on Table did before
    expect(actions.clearCellResult).toHaveBeenCalledWith("a")
    expect(publish).not.toHaveBeenCalled()
  })

  it("closes a chart through the draw toggle", () => {
    // Given a cell that shows its chart
    // When its results are closed
    renderWith("chart").closeResults()
    // Then the draw toggle leaves chart mode, as a second click on Chart did
    expect(publish).toHaveBeenCalledWith(EventType.NOTEBOOK_CELL_DRAW, {
      cellId: "a",
    })
    expect(actions.clearCellResult).not.toHaveBeenCalled()
  })

  it("does not close the results while the cell is busy or has no view", () => {
    renderWith("grid", true).closeResults()
    renderWith("chart", true).closeResults()
    renderWith("none").closeResults()
    expect(actions.clearCellResult).not.toHaveBeenCalled()
    expect(publish).not.toHaveBeenCalled()
  })
})
