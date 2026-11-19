// @vitest-environment jsdom
import "fake-indexeddb/auto"
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import { db } from "../../store/db"
import { bufferStore, makeBuffer } from "../../store/buffers"
import { buildMonitoringDashboard, monitoringTemplateId } from "./dashboard"
import { closeUnmodifiedMonitoring } from "./closeDashboard"
import { saveNotebookColumnLayout } from "../../scenes/Editor/Notebook/notebookColumnLayoutStore"

vi.hoisted(() => {
  const { jsdom } = globalThis as typeof globalThis & {
    jsdom: { window: Window }
  }
  vi.stubGlobal("localStorage", jsdom.window.localStorage)
})
afterAll(() => db.close())

const live = vi.hoisted(() => ({ readView: vi.fn(), sequence: 0 }))
vi.mock("../notebooks/notebookController", () => ({
  getController: () => ({ readView: live.readView }),
}))
vi.mock("../notebooks/notebookAIBridge", () => ({
  getBufferActionSeq: () => live.sequence,
}))

const setup = async () => {
  const view = buildMonitoringDashboard({
    name: "trades",
    kind: "table",
    telemetryEnabled: true,
  })
  const label = "trades · monitoring"
  const id = await db.buffers.add(
    makeBuffer({
      label,
      position: 1,
      notebookViewState: view,
      templateId: monitoringTemplateId("table"),
      monitoring: {
        target: { kind: "table", name: "trades" },
        templateVersion: 1,
      },
    }),
  )
  live.readView.mockResolvedValue(view)
  return {
    view,
    id,
    remove: vi.fn(async () => {
      await db.buffers.delete(id)
    }),
  }
}
beforeEach(async () => {
  await db.buffers.clear()
  localStorage.clear()
  live.readView.mockReset()
  live.sequence = 0
})

describe("closing a monitoring dashboard", () => {
  it("preserves customized grid columns even when the SQL is unchanged", async () => {
    const { id, view, remove } = await setup()
    saveNotebookColumnLayout(id, view.cells[1].id, "query", {
      columnOrder: ["Rows", "Table"],
    })
    // Arranging columns detaches the dashboard from its template.
    await vi.waitFor(async () =>
      expect((await db.buffers.get(id))?.templateId).toBeUndefined(),
    )
    expect(await closeUnmodifiedMonitoring(id, remove)).toBe(false)
    expect(remove).not.toHaveBeenCalled()
  })
  it("discards an unmodified generated dashboard", async () => {
    const { id, remove } = await setup()
    expect(await closeUnmodifiedMonitoring(id, remove)).toBe(true)
    expect(await db.buffers.get(id)).toBeUndefined()
  })

  it("persists a live edit before allowing the notebook to be archived", async () => {
    const { id, view, remove } = await setup()
    const edited = structuredClone(view)
    edited.cells[1].value = "select 42"
    live.readView.mockResolvedValue(edited)
    expect(await closeUnmodifiedMonitoring(id, remove)).toBe(false)
    expect(remove).not.toHaveBeenCalled()
    const stored = await db.buffers.get(id)
    expect(stored?.notebookViewState?.cells[1].value).toBe("select 42")
    expect(stored?.templateId).toBeUndefined()
  })

  it("preserves a renamed dashboard", async () => {
    const { id, remove } = await setup()
    await bufferStore.update(id, { label: "Keep this investigation" })
    expect(await closeUnmodifiedMonitoring(id, remove)).toBe(false)
    expect(remove).not.toHaveBeenCalled()
  })

  it("preserves a dashboard whose live content cannot be read", async () => {
    const { id, remove } = await setup()
    live.readView.mockRejectedValue(new Error("unmounting"))
    expect(await closeUnmodifiedMonitoring(id, remove)).toBe(false)
    expect(remove).not.toHaveBeenCalled()
  })

  it("archives an unmodified dashboard that an AI chat is bound to", async () => {
    const { id, remove } = await setup()
    await db.ai_conversations.put({
      id: "chat",
      conversationName: "About trades",
      createdAt: 1,
      updatedAt: 1,
      notebookBufferId: id,
    } as never)
    try {
      expect(await closeUnmodifiedMonitoring(id, remove)).toBe(false)
      expect(remove).not.toHaveBeenCalled()
    } finally {
      await db.ai_conversations.clear()
    }
  })

  it("does not delete if another user action arrives during inspection", async () => {
    const { id, view, remove } = await setup()
    live.readView.mockImplementation(() => {
      live.sequence++
      return Promise.resolve(view)
    })
    expect(await closeUnmodifiedMonitoring(id, remove)).toBe(false)
    expect(remove).not.toHaveBeenCalled()
  })

  it("keeps the focused cell when persisting a live edit on close", async () => {
    const { id, view, remove } = await setup()
    const focused = view.cells[1].id
    await db.buffers.update(id, {
      notebookViewState: { ...view, focusedCellId: focused },
    })
    // The live controller's view has no focusedCellId.
    live.readView.mockResolvedValue({
      cells: view.cells.map((cell, index) =>
        index === 1 ? { ...cell, value: "select 2" } : cell,
      ),
      settings: view.settings,
      maximizedCellId: null,
    })
    expect(await closeUnmodifiedMonitoring(id, remove)).toBe(false)
    const stored = await db.buffers.get(id)
    expect(stored?.notebookViewState?.cells[1].value).toBe("select 2")
    expect(stored?.notebookViewState?.focusedCellId).toBe(focused)
  })
})
