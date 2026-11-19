// @vitest-environment jsdom
import React from "react"
import { act, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { renderComponent } from "../../../../test/component"
import { authSessionState } from "../../../../modules/OAuth2/authSessionState"
import { requestTransferMonitor } from "../../../../utils/notebooks/notebookTransferState"
import type { NotebookCell } from "../../../../store/notebook"
import { CellToolbar } from "./CellToolbar"

const actions = vi.hoisted(() => ({
  moveCellUp: vi.fn(),
  moveCellDown: vi.fn(),
  duplicateCell: vi.fn(),
  deleteCell: vi.fn(),
  setFocusedCell: vi.fn(),
  setMaximizedCellId: vi.fn(),
  setCellRefresh: vi.fn(),
  setCellPaneView: vi.fn(),
  setCellMode: vi.fn(),
  clearCellResult: vi.fn(),
}))
vi.mock("../NotebookProvider", () => ({
  useNotebookActions: () => actions,
  useNotebookBufferId: () => 1,
}))
vi.mock("../cellRefresh/CellRefreshContext", () => ({
  selectWriteBlocked: () => false,
  useCellFetchSelector: () => false,
}))
vi.mock("../../../../modules/ConsoleEventTracker", () => ({
  trackEvent: vi.fn(),
}))
vi.mock("../../../../utils/notebooks/notebookAIBridge", () => ({
  emitUserAction: vi.fn(),
  signalUserEdit: vi.fn(),
}))

afterEach(() => {
  authSessionState.endSession()
  actions.setCellRefresh.mockReset()
})

// A grid cell with a result: below the expanded toolbar tier its interval
// control lives in the overflow menu's Auto-refresh submenu.
const cell: NotebookCell = {
  id: "c1",
  position: 0,
  value: "select 1",
  lastRunStatus: "success",
  result: {
    results: [
      {
        type: "dql",
        query: "select 1",
        columns: [{ name: "x", type: "LONG" }],
        dataset: [[1]],
        count: 1,
      },
    ],
    activeResultIndex: 0,
    timestamp: 1,
  },
}

const renderToolbar = () =>
  renderComponent(
    <CellToolbar
      cellId="c1"
      cell={cell}
      cellIndex={0}
      totalCells={1}
      layoutMode="list"
      isMaximized={false}
      toolbarTier="standard"
      inline
    />,
  )

const openMoreActions = () =>
  userEvent.click(screen.getByRole("button", { name: "More actions" }))
const autoRefreshItem = () =>
  screen.getByRole("menuitem", { name: /^Auto-refresh/ })
const intervalOptions = () => screen.queryAllByRole("menuitemradio")

describe("cell toolbar Auto-refresh submenu", () => {
  it("opens from the overflow menu and starts closed when the menu reopens", async () => {
    renderToolbar()
    await openMoreActions()
    await userEvent.click(autoRefreshItem())
    await waitFor(() => expect(intervalOptions().length).toBeGreaterThan(0))

    await act(async () => {
      await userEvent.keyboard("{Escape}")
    })
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())

    await openMoreActions()
    expect(autoRefreshItem()).toBeTruthy()
    expect(intervalOptions()).toEqual([])
  })

  it("opens at its interval options for an auto-refresh transfer", async () => {
    renderToolbar()
    act(() => requestTransferMonitor(1, "c1"))
    await waitFor(() => expect(intervalOptions().length).toBeGreaterThan(0))

    await userEvent.click(screen.getByRole("menuitemradio", { name: /^5s/ }))
    expect(actions.setCellRefresh).toHaveBeenCalledWith("c1", "5s")
  })

  it("starts closed when the menu reopens after a transfer opened it", async () => {
    renderToolbar()
    act(() => requestTransferMonitor(1, "c1"))
    await waitFor(() => expect(intervalOptions().length).toBeGreaterThan(0))

    await act(async () => {
      await userEvent.keyboard("{Escape}")
    })
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())

    await openMoreActions()
    expect(autoRefreshItem()).toBeTruthy()
    expect(intervalOptions()).toEqual([])
  })

  it("ignores a transfer request for another cell", async () => {
    renderToolbar()
    act(() => requestTransferMonitor(1, "other"))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.queryByRole("menu")).toBeNull()
  })
})
