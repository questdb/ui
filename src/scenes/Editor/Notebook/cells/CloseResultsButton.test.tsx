// @vitest-environment jsdom
import React, { useState } from "react"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { renderComponent } from "../../../../test/component"
import { Button } from "../../../../components"
import { EventType } from "../../../../modules/EventBus/types"
import type { CellView } from "../notebookUtils"
import { CloseResultsButton } from "./CloseResultsButton"

const publish = vi.hoisted(() => vi.fn())

vi.mock("../../../../modules/EventBus", () => ({
  eventBus: { publish },
}))
vi.mock("../../../../modules/ConsoleEventTracker", () => ({
  trackEvent: vi.fn(),
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

// The cell around the button: it shows the button while there are results,
// as Cell does, and its toolbar takes the focus the button hands back.
const FakeCell = ({
  initialView,
  busy = false,
}: {
  initialView: CellView
  busy?: boolean
}) => {
  const [view, setView] = useState<CellView>(initialView)
  actions.clearCellResult.mockImplementation(() => setView("none"))
  publish.mockImplementation((type: EventType) => {
    if (type === EventType.NOTEBOOK_CELL_DRAW) setView("none")
  })

  return (
    <div>
      <Button>More actions</Button>
      {view !== "none" && (
        <CloseResultsButton
          cellId="a"
          view={view}
          paneLayout="split"
          isCellBusy={busy}
          onClosedWhileFocused={() =>
            screen.getByRole("button", { name: "More actions" }).focus()
          }
        />
      )}
    </div>
  )
}

const closeButton = () => screen.getByRole("button", { name: "Close results" })

describe("CloseResultsButton", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("clears a table result on click", async () => {
    // Given a cell that shows its table
    renderComponent(<FakeCell initialView="grid" />)

    // When the user clicks Close results
    await userEvent.click(closeButton())

    // Then the result is cleared and the button goes with it
    expect(actions.clearCellResult).toHaveBeenCalledWith("a")
    expect(screen.queryByRole("button", { name: "Close results" })).toBeNull()
  })

  it("leaves draw mode to close a chart", async () => {
    // Given a cell that shows its chart
    renderComponent(<FakeCell initialView="chart" />)

    // When the user clicks Close results
    await userEvent.click(closeButton())

    // Then the draw toggle closes the chart, without clearing directly
    expect(publish).toHaveBeenCalledWith(EventType.NOTEBOOK_CELL_DRAW, {
      cellId: "a",
    })
    expect(actions.clearCellResult).not.toHaveBeenCalled()
  })

  it("keeps keyboard focus in the cell after closing with Enter", async () => {
    // Given keyboard focus on Close results over a table
    renderComponent(<FakeCell initialView="grid" />)
    closeButton().focus()

    // When the user presses Enter
    await userEvent.keyboard("{Enter}")

    // Then the results close, and focus moves to the cell's toolbar instead
    // of falling to the page body
    expect(actions.clearCellResult).toHaveBeenCalledWith("a")
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "More actions" }),
    )
  })

  it("does nothing while the cell is busy", async () => {
    // Given a busy cell with focus on Close results
    renderComponent(<FakeCell initialView="grid" busy />)
    closeButton().focus()

    // When the user presses Enter
    await userEvent.keyboard("{Enter}")

    // Then the results stay and focus stays on the button
    expect(actions.clearCellResult).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(closeButton())
  })
})
