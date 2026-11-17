// @vitest-environment jsdom
import React, { useState } from "react"
import { act, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { renderComponent } from "../../../../test/component"
import { MarkdownCell } from "./MarkdownCell"

const actions = vi.hoisted(() => ({
  setFocusedCell: vi.fn(),
  updateCell: vi.fn(),
  moveCellUp: vi.fn(),
  moveCellDown: vi.fn(),
  getCellsSnapshot: () => [],
}))
vi.mock("../NotebookProvider", () => ({
  useNotebookActions: () => actions,
  useNotebookBufferId: () => 1,
}))
vi.mock("../../../../modules/ConsoleEventTracker", () => ({
  trackEvent: vi.fn(),
}))
vi.mock("../../../../utils/notebooks/notebookAIBridge", () => ({
  emitUserAction: vi.fn(),
  signalUserEdit: vi.fn(),
}))
vi.mock("./CellDragHeader", () => ({
  CellDragHeader: ({ right }: { right: React.ReactNode }) => <div>{right}</div>,
}))

// Owns focus and the cell value the way NotebookProvider does.
const Host = () => {
  const [focused, setFocused] = useState<string | null>(null)
  const [value, setValue] = useState("")
  actions.setFocusedCell.mockImplementation(setFocused)
  actions.updateCell.mockImplementation(
    (_id: string, patch: { value?: string }) => {
      if (patch.value !== undefined) setValue(patch.value)
    },
  )
  return (
    <div data-testid="host" data-focused={String(focused)}>
      <MarkdownCell
        cell={{ id: "md", position: 0, type: "markdown", value }}
        index={0}
        totalCells={1}
        layoutMode="list"
        isFocused={focused === "md"}
        isMaximized={false}
      />
    </div>
  )
}

const textarea = () => document.querySelector("textarea")

describe("MarkdownCell Escape", () => {
  it("finishes editing a cell that has text", async () => {
    renderComponent(<Host />)
    await userEvent.click(textarea()!)
    await userEvent.type(textarea()!, "# Notes")
    expect(screen.getByTestId("host").dataset.focused).toBe("md")

    await act(async () => {
      await userEvent.keyboard("{Escape}")
    })

    expect(screen.getByTestId("host").dataset.focused).toBe("null")
    expect(textarea()).toBeNull()
    expect(screen.getByRole("heading", { name: "Notes" })).toBeTruthy()
  })
})
