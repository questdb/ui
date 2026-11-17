// @vitest-environment jsdom
import "fake-indexeddb/auto"
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import { db } from "../../store/db"
import { makeBuffer } from "../../store/buffers"
import { buildMonitoringDashboard, monitoringFingerprint } from "./dashboard"
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
    walEnabled: true,
  })
  const label = "trades · monitoring"
  const id = await db.buffers.add(
    makeBuffer({
      label,
      position: 1,
      notebookViewState: view,
      monitoring: {
        target: { instanceKey: "db", kind: "table", name: "trades" },
        templateVersion: 1,
        initialFingerprint: monitoringFingerprint(label, view),
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
    expect((await db.buffers.get(id))?.notebookViewState?.cells[1].value).toBe(
      "select 42",
    )
  })

  it("preserves a renamed dashboard and one whose live content cannot be read", async () => {
    const { id, remove } = await setup()
    await db.buffers.update(id, { label: "Keep this investigation" })
    expect(await closeUnmodifiedMonitoring(id, remove)).toBe(false)
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
})
