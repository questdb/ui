// @vitest-environment jsdom
import React from "react"
import { act, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { renderComponent } from "../../../src/test/component"
import {
  EditorProvider,
  useEditor,
  type EditorContext,
} from "../../../src/providers/EditorProvider"
import { NotebookToolbar } from "../../../src/scenes/Editor/Notebook/NotebookToolbar"
import { db } from "../../../src/store/db"
import { bufferStore, makeBuffer, BufferType } from "../../../src/store/buffers"
import { trackEvent } from "../../../src/modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../../src/modules/ConsoleEventTracker/events"
import {
  buildMonitoringDashboard,
  monitoringFingerprint,
} from "../../../src/utils/monitoring/dashboard"

vi.mock("../../../src/providers/AIConversationProvider", () => ({
  useAIConversationActions: () => ({ openNotebookChat: () => {} }),
}))
vi.mock("../../../src/providers/AIStatusProvider", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../../src/providers/AIStatusProvider")
  >()),
  useAIStatus: () => ({ canUse: false, status: null }),
}))

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
// Toolbar decoration is outside this contract. The toolbar's duplicate handler,
// EditorProvider operations and IndexedDB writes remain real.
vi.mock("../../../src/scenes/Editor/Notebook/globals/VariablesPopover", () => ({
  VariablesPopover: () => null,
}))
vi.mock("../../../src/scenes/Editor/Notebook/NotebookRefreshControl", () => ({
  NotebookRefreshControl: () => null,
}))

vi.mock("../../../src/scenes/Editor/Notebook/NotebookViewToggle", () => ({
  NotebookLayoutToggle: () => null,
}))

const events = (event: ConsoleEvent) =>
  vi.mocked(trackEvent).mock.calls.filter(([name]) => name === event)
let editor!: EditorContext
const mount = async () => {
  const Harness = () => {
    editor = useEditor()
    return (
      <>
        <span data-testid="active">{editor.activeBuffer.id}</span>
        <NotebookToolbar />
      </>
    )
  }
  renderComponent(
    <EditorProvider>
      <Harness />
    </EditorProvider>,
  )
  await waitFor(() =>
    expect(screen.getByTestId("active")).toHaveTextContent("41"),
  )
}
beforeEach(async () => {
  vi.clearAllMocks()
  await db.buffers.clear()
  await db.editor_settings.clear()
  await db.notebook_results.clear()
  await db.buffers.bulkPut([
    {
      id: 41,
      ...makeBuffer({
        label: "Source",
        position: 0,
        notebookViewState: {
          cells: [{ id: "source-cell", position: 0, value: "select 1" }],
        },
      }),
    },
    {
      id: 99,
      ...makeBuffer({
        label: "Other",
        position: 1,
        notebookViewState: { cells: [] },
      }),
    },
  ])
  await db.editor_settings.add({ key: "activeBufferId", value: 41 })
})

describe("UI notebook lifecycle telemetry", () => {
  it("links a toolbar duplicate to its source and the newly persisted notebook, once", async () => {
    await mount()
    await userEvent.click(
      screen.getByRole("button", { name: "Duplicate notebook" }),
    )
    await waitFor(() =>
      expect(events(ConsoleEvent.NOTEBOOK_DUPLICATE)).toHaveLength(1),
    )
    const copy = (await db.buffers.toArray()).find(
      (buffer) => buffer.id !== 41 && buffer.id !== 99,
    )!
    expect(copy).toBeDefined()
    expect(copy.notebookViewState?.cells[0].value).toBe("select 1")
    expect(events(ConsoleEvent.NOTEBOOK_DUPLICATE)[0][1]).toMatchObject({
      sourceNotebookId: 41,
      notebookId: copy.id,
      outcome: "success",
    })
    expect(copy.id).not.toBe(41)
    expect(screen.getByTestId("active")).toHaveTextContent(String(copy.id))
  })

  it("reports a failed duplicate without inventing a destination ID", async () => {
    await mount()
    vi.spyOn(db.buffers, "add").mockRejectedValueOnce(
      new DOMException("private content", "QuotaExceededError"),
    )
    await userEvent.click(
      screen.getByRole("button", { name: "Duplicate notebook" }),
    )
    await waitFor(() =>
      expect(events(ConsoleEvent.NOTEBOOK_DUPLICATE)).toHaveLength(1),
    )
    expect(events(ConsoleEvent.NOTEBOOK_DUPLICATE)[0][1]).toEqual({
      sourceNotebookId: 41,
      outcome: "error",
      reason: "storage_quota",
    })
    expect(await db.buffers.count()).toBe(2)
  })

  it("reports the tab-limit duplicate as not_created without a new ID", async () => {
    await db.buffers.bulkAdd(
      Array.from({ length: 98 }, (_, index) =>
        makeBuffer({ label: `Extra ${index}`, position: index + 2 }),
      ),
    )
    await mount()
    await userEvent.click(
      screen.getByRole("button", { name: "Duplicate notebook" }),
    )
    await waitFor(() =>
      expect(events(ConsoleEvent.NOTEBOOK_DUPLICATE)).toHaveLength(1),
    )
    expect(events(ConsoleEvent.NOTEBOOK_DUPLICATE)[0][1]).toMatchObject({
      sourceNotebookId: 41,
      outcome: "not_created",
    })
    expect(
      events(ConsoleEvent.NOTEBOOK_DUPLICATE)[0][1]?.notebookId,
    ).toBeUndefined()
    expect(await db.buffers.count()).toBe(100)
  })

  it("reports the notebook being archived, even when another notebook is active", async () => {
    await mount()
    await act(async () => {
      await editor.setActiveBuffer((await db.buffers.get(99))!)
    })
    await act(async () => {
      await editor.archiveBuffer(41)
    })
    expect((await db.buffers.get(41))?.archived).toBe(true)
    expect(events(ConsoleEvent.TAB_ARCHIVE)).toEqual([
      [
        ConsoleEvent.TAB_ARCHIVE,
        { type: BufferType.NOTEBOOK, notebookId: 41, outcome: "archived" },
      ],
    ])
  })

  it("records an unmodified monitoring dashboard as discarded_template after deletion", async () => {
    const view = buildMonitoringDashboard({
      name: "trades",
      kind: "table",
      telemetryEnabled: false,
    })
    await db.buffers.update(41, {
      notebookViewState: view,
      monitoring: {
        target: { instanceKey: "test", kind: "table", name: "trades" },
        templateVersion: 1,
        initialFingerprint: monitoringFingerprint("Source", view),
      },
    })
    await mount()
    await act(async () => {
      await editor.archiveBuffer(41)
    })
    expect(await db.buffers.get(41)).toBeUndefined()
    expect(events(ConsoleEvent.TAB_ARCHIVE)).toEqual([
      [
        ConsoleEvent.TAB_ARCHIVE,
        {
          type: BufferType.NOTEBOOK,
          notebookId: 41,
          outcome: "discarded_template",
        },
      ],
    ])
  })

  it.each(["user", "agent"] as const)(
    "detaches a dashboard the %s archives, keeping it as a personal notebook",
    async (initiator) => {
      const view = buildMonitoringDashboard({
        name: "trades",
        kind: "table",
        telemetryEnabled: false,
      })
      await db.buffers.update(41, {
        notebookViewState: view,
        monitoring: {
          target: { instanceKey: "test", kind: "table", name: "trades" },
          templateVersion: 1,
          // Customized: a user close archives it instead of discarding it.
          initialFingerprint: "customized",
        },
      })
      await mount()
      await act(async () => {
        await editor.archiveBuffer(41, initiator)
      })
      const archived = await db.buffers.get(41)
      expect(archived?.archived).toBe(true)
      expect(archived).not.toHaveProperty("monitoring")
    },
  )

  it("does not report an agent archive as a UI gesture", async () => {
    await mount()
    await act(async () => {
      await editor.archiveBuffer(41, "agent")
    })
    expect((await db.buffers.get(41))?.archived).toBe(true)
    expect(events(ConsoleEvent.TAB_ARCHIVE)).toHaveLength(0)
  })

  it("does not report archive success when persistence fails", async () => {
    await mount()
    const error = new Error("disk unavailable")
    vi.spyOn(bufferStore, "update").mockRejectedValueOnce(error)
    await act(async () => {
      await expect(editor.archiveBuffer(41)).rejects.toBe(error)
    })
    expect((await db.buffers.get(41))?.archived).not.toBe(true)
    expect(events(ConsoleEvent.TAB_ARCHIVE)).toHaveLength(0)
  })
})
