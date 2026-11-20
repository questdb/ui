// @vitest-environment jsdom
import React from "react"
import { act, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { renderComponent } from "../../../src/test/component"
import {
  EditorProvider,
  useActiveBufferSummary,
  useEditor,
  type EditorContext,
} from "../../../src/providers/EditorProvider"
import { db } from "../../../src/store/db"
import { makeBuffer } from "../../../src/store/buffers"

vi.mock("@monaco-editor/react", () => ({
  loader: { config: () => {}, init: () => new Promise(() => {}) },
}))
vi.mock(
  "../../../src/scenes/Editor/Monaco/questdb-sql/useSchemaCompletionProvider",
  () => ({ useSchemaCompletionProvider: () => {} }),
)
vi.mock("../../../src/modules/ConsoleEventTracker", () => ({
  trackEvent: vi.fn(),
}))

let editor!: EditorContext
let summaryRenders = 0

// Memoized, so it renders only when the summary context value changes.
const SummaryProbe = React.memo(() => {
  const { id, isNotebook } = useActiveBufferSummary()
  summaryRenders++
  return (
    <span data-testid="summary">
      {id}:{String(isNotebook)}
    </span>
  )
})

const mount = async () => {
  const Harness = () => {
    editor = useEditor()
    return null
  }
  renderComponent(
    <EditorProvider>
      <Harness />
      <SummaryProbe />
    </EditorProvider>,
  )
  await waitFor(() =>
    expect(screen.getByTestId("summary")).toHaveTextContent("1:false"),
  )
}

beforeEach(async () => {
  summaryRenders = 0
  await db.buffers.clear()
  await db.editor_settings.clear()
  await db.buffers.bulkPut([
    { id: 1, ...makeBuffer({ label: "SQL", value: "select 1", position: 0 }) },
    {
      id: 2,
      ...makeBuffer({
        label: "Notebook",
        position: 1,
        notebookViewState: { cells: [] },
      }),
    },
  ])
  await db.editor_settings.add({ key: "activeBufferId", value: 1 })
})

describe("active buffer summary", () => {
  it("does not change while the active SQL buffer is edited", async () => {
    await mount()
    const before = summaryRenders
    // Each keystroke in the SQL editor persists the buffer value.
    for (const value of ["select 1 ", "select 1 f", "select 1 fr"]) {
      await act(async () => {
        await editor.updateBuffer(1, { value })
      })
    }
    await waitFor(async () =>
      expect((await db.buffers.get(1))?.value).toBe("select 1 fr"),
    )
    expect(summaryRenders).toBe(before)
  })

  it("follows the active tab and its kind", async () => {
    await mount()
    const notebook = (await db.buffers.get(2))!
    await act(async () => {
      await editor.setActiveBuffer(notebook)
    })
    await waitFor(() =>
      expect(screen.getByTestId("summary")).toHaveTextContent("2:true"),
    )
  })
})
