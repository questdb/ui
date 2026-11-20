// @vitest-environment jsdom
import React from "react"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { renderComponent } from "../../../test/component"
import { Button, DropdownMenu } from "../../../components"
import { MAX_NOTEBOOK_CELLS } from "../../../store/notebook"
import type { NotebookTransferRequest } from "../../../hooks/useNotebookTransfer"
import { NotebookFromEditorMenu } from "./NotebookFromEditorMenu"

const mocks = vi.hoisted(() => ({
  transfer: vi.fn<[NotebookTransferRequest], Promise<void>>(),
  value: "",
}))
vi.mock("../../../providers/EditorProvider", () => ({
  useEditor: () => ({
    activeBuffer: { id: 1, label: "Analysis", value: mocks.value, position: 0 },
    editorRef: { current: null },
  }),
}))
vi.mock("../../../hooks/useNotebookTransfer", () => ({
  useNotebookTransfer: () => ({ transfer: mocks.transfer, busy: false }),
}))

const openMenu = (value: string) => {
  mocks.value = value
  mocks.transfer.mockClear()
  renderComponent(
    <DropdownMenu.Root open>
      <DropdownMenu.Trigger asChild>
        <Button>Menu</Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content>
        <NotebookFromEditorMenu />
      </DropdownMenu.Content>
    </DropdownMenu.Root>,
  )
  return screen.getByRole("menuitem", { name: /Convert to notebook/ })
}

describe("Convert to notebook", () => {
  it("copies only the first cells a notebook can hold and says so", async () => {
    const queries = Array.from(
      { length: MAX_NOTEBOOK_CELLS + 1 },
      (_, i) => `select ${i};`,
    )
    const item = openMenu(queries.join("\n"))
    expect(item).toHaveTextContent(
      `First ${MAX_NOTEBOOK_CELLS} of ${MAX_NOTEBOOK_CELLS + 1} queries`,
    )
    await userEvent.click(item)
    const [request] = mocks.transfer.mock.calls[0]
    expect(request.queries).toHaveLength(MAX_NOTEBOOK_CELLS)
    expect(request.queries[0]).toEqual({ sql: "select 0;" })
    expect(request.queries.at(-1)).toEqual({
      sql: `select ${MAX_NOTEBOOK_CELLS - 1};`,
    })
    expect(request.queries.some((query) => "result" in query)).toBe(false)
    expect(request).toMatchObject({
      source: "editor_split",
      sourceBufferId: 1,
    })
  })

  it("converts a script within the limit without a subtitle", async () => {
    const item = openMenu("select 1;\nselect 2;")
    expect(item).not.toHaveTextContent(/First \d+ of/)
    await userEvent.click(item)
    expect(mocks.transfer.mock.calls[0][0].queries).toEqual([
      { sql: "select 1;" },
      { sql: "select 2;" },
    ])
  })
})
