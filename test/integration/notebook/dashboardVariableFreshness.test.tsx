// @vitest-environment jsdom
import React from "react"
import { act, fireEvent, screen } from "@testing-library/react"
import { expect, it, vi } from "vitest"
import { renderComponent } from "../../../src/test/component"
import { db } from "../../../src/store/db"
import { Button } from "../../../src/components/Button"
import {
  NotebookProvider,
  useNotebookActions,
  useNotebookState,
} from "../../../src/scenes/Editor/Notebook/NotebookProvider"
import {
  captureReadSeq,
  createNotebookFreshness,
} from "../../../src/utils/notebooks/notebookFreshness"

const updateBuffer = vi.fn()
vi.mock("../../../src/providers/EditorProvider", () => ({
  useEditor: () => ({ updateBuffer }),
}))

const Selection = () => {
  const { setVariableValues } = useNotebookActions()
  const { settings } = useNotebookState()
  return (
    <>
      <output>{settings.variables?.[0]?.value}</output>
      <Button onClick={() => setVariableValues({ station: "'east'" })}>
        East
      </Button>
      <Button onClick={() => setVariableValues({ station: "'west'" })}>
        West
      </Button>
    </>
  )
}

it("invalidates an agent's earlier notebook read only when a selection changes its variables", async () => {
  await db.open()
  // Given an agent baselined the notebook with station set to east
  const bufferId = 91
  renderComponent(
    <NotebookProvider
      bufferId={bufferId}
      initialState={{
        cells: [],
        settings: { variables: [{ name: "station", value: "'east'" }] },
      }}
    >
      <Selection />
    </NotebookProvider>,
  )
  const freshness = createNotebookFreshness([
    [bufferId, captureReadSeq(bufferId)],
  ])

  // When choosing the same value, then the previous read remains valid
  fireEvent.click(screen.getByRole("button", { name: "East" }))
  expect(freshness.assertFresh(bufferId)).toBe("fresh")

  // When choosing another value, then the old variables cannot be replayed
  fireEvent.click(screen.getByRole("button", { name: "West" }))
  expect(screen.getByRole("status")).toHaveTextContent("'west'")
  expect(freshness.assertFresh(bufferId)).toBe("stale")
})

it("neither saves nor re-queries when a selection sets the value it already has", async () => {
  await db.open()
  // Given a notebook with station set to east
  renderComponent(
    <NotebookProvider
      bufferId={92}
      initialState={{
        cells: [],
        settings: { variables: [{ name: "station", value: "'east'" }] },
      }}
    >
      <Selection />
    </NotebookProvider>,
  )
  await act(() => new Promise((resolve) => setTimeout(resolve, 50)))
  updateBuffer.mockClear()

  // When the user selects east again
  fireEvent.click(screen.getByRole("button", { name: "East" }))
  await act(() => new Promise((resolve) => setTimeout(resolve, 50)))

  // Then nothing is written
  expect(updateBuffer).not.toHaveBeenCalled()

  // When the user selects west, then the new value is saved
  fireEvent.click(screen.getByRole("button", { name: "West" }))
  await act(() => new Promise((resolve) => setTimeout(resolve, 50)))
  expect(updateBuffer).toHaveBeenCalled()
})
