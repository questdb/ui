// @vitest-environment jsdom
import React from "react"
import { act, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { renderComponent } from "../../../src/test/component"
import {
  EditorProvider,
  useEditor,
  type EditorContext,
} from "../../../src/providers/EditorProvider"
import {
  NotebookProvider,
  useNotebookActions,
  type NotebookActions,
} from "../../../src/scenes/Editor/Notebook/NotebookProvider"
import { db } from "../../../src/store/db"
import { makeBuffer } from "../../../src/store/buffers"
import type { NotebookViewState } from "../../../src/store/notebook"
import { buildMonitoringDashboard } from "../../../src/utils/monitoring/dashboard"
import { monitoringTemplateId } from "../../../src/utils/monitoring/identity"
import {
  beginNotebookMount,
  getController,
} from "../../../src/utils/notebooks/notebookController"
import { NotebookToolError } from "../../../src/utils/notebooks/notebookToolError"
import { enqueueBufferTask } from "../../../src/utils/notebooks/notebookBufferQueue"
import { signalUserEdit } from "../../../src/utils/notebooks/notebookAIBridge"

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
vi.mock("../../../src/components/Toast", () => ({ toast: { error: vi.fn() } }))

const DASHBOARD = 41
const OTHER = 99
const LABEL = "trades · monitoring"
const PANEL = "Live table health"

let editor!: EditorContext
let actions!: NotebookActions
let view!: NotebookViewState

const stored = () => db.buffers.get(DASHBOARD)
const panelId = () => view.cells.find((cell) => cell.name === PANEL)!.id
const storedPanelValue = async () =>
  (await stored())?.notebookViewState?.cells.find((c) => c.id === panelId())
    ?.value
// Mounts the dashboard as the console does: a seeded mount claim, then a live
// NotebookProvider (real persistence, real controller) inside EditorProvider.
const mount = async () => {
  const seed = await beginNotebookMount(DASHBOARD)
  if (seed instanceof NotebookToolError) throw seed
  const Actions = () => {
    actions = useNotebookActions()
    return null
  }
  const Harness = () => {
    editor = useEditor()
    return (
      <>
        <span data-testid="active">{editor.activeBuffer.id}</span>
        <NotebookProvider bufferId={DASHBOARD} initialState={seed}>
          <Actions />
        </NotebookProvider>
      </>
    )
  }
  renderComponent(
    <EditorProvider>
      <Harness />
    </EditorProvider>,
  )
  await waitFor(() =>
    expect(screen.getByTestId("active")).toHaveTextContent(String(DASHBOARD)),
  )
  await waitFor(() => expect(getController(DASHBOARD)?.kind).toBe("live"))
}

beforeEach(async () => {
  // The previous test's unmount flushes its pending debounced write through
  // this queue; let it land before re-seeding, or it overwrites the new seed.
  await enqueueBufferTask(DASHBOARD, () => Promise.resolve())
  vi.clearAllMocks()
  await db.buffers.clear()
  await db.editor_settings.clear()
  await db.notebook_results.clear()
  await db.ai_conversations.clear()
  view = buildMonitoringDashboard({
    name: "trades",
    kind: "table",
    telemetryEnabled: false,
  })
  await db.buffers.bulkPut([
    {
      id: DASHBOARD,
      ...makeBuffer({
        label: LABEL,
        position: 0,
        notebookViewState: view,
        templateId: monitoringTemplateId("table"),
        monitoring: {
          target: { kind: "table", name: "trades" },
        },
      }),
    },
    {
      id: OTHER,
      ...makeBuffer({
        label: "Other",
        position: 1,
        notebookViewState: { cells: [] },
      }),
    },
  ])
  await db.editor_settings.add({ key: "activeBufferId", value: DASHBOARD })
})

// Closing an unedited dashboard deletes it for good, so the close must see an
// edit that only the live notebook holds (the debounced save is still pending).
describe("closing an open monitoring dashboard", () => {
  it("archives a dashboard whose live edit is not persisted yet, keeping the edit", async () => {
    await mount()
    const original = await storedPanelValue()
    expect(original).toBeDefined()
    act(() => {
      actions.updateCell(panelId(), { value: "select 42" })
      signalUserEdit(DASHBOARD)
    })
    expect(await storedPanelValue()).toBe(original)
    expect((await stored())?.templateId).toBeDefined()

    await act(async () => {
      await editor.closeBuffer(DASHBOARD)
    })

    const archived = await stored()
    expect(archived?.archived).toBe(true)
    expect(archived).not.toHaveProperty("templateId")
    expect(await storedPanelValue()).toBe("select 42")
  })

  it("keeps the focused cell when it archives a live edit", async () => {
    const focused = view.cells.find((cell) => cell.name === PANEL)!.id
    await db.buffers.update(DASHBOARD, {
      notebookViewState: { ...view, focusedCellId: focused },
    })
    await mount()
    act(() => {
      actions.updateCell(panelId(), { value: "select 42" })
      signalUserEdit(DASHBOARD)
    })

    await act(async () => {
      await editor.closeBuffer(DASHBOARD)
    })

    const archived = await stored()
    expect(archived?.archived).toBe(true)
    expect(archived?.notebookViewState?.focusedCellId).toBe(focused)
  })

  it("still discards an untouched dashboard that is open with a live controller", async () => {
    await mount()
    await act(async () => {
      await editor.closeBuffer(DASHBOARD)
    })
    expect(await stored()).toBeUndefined()
  })
})
