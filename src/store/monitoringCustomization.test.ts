// @vitest-environment jsdom
import "fake-indexeddb/auto"
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import { db } from "./db"
import { bufferStore, makeBuffer } from "./buffers"
import { markMonitoringColumnsCustomized } from "./monitoringCustomization"
import { trackEvent } from "../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../modules/ConsoleEventTracker/events"
import {
  monitoringFingerprint,
  isUnmodifiedMonitoring,
} from "../utils/monitoring/fingerprint"
import { createDefaultNotebookViewState } from "./notebook"
import {
  commitView,
  partsOf,
  cancelPendingSearchPublish,
} from "../utils/notebooks/notebookDexieView"

vi.mock("../modules/ConsoleEventTracker", () => ({ trackEvent: vi.fn() }))
vi.hoisted(() => {
  const { jsdom } = globalThis as typeof globalThis & {
    jsdom: { window: Window }
  }
  vi.stubGlobal("localStorage", jsdom.window.localStorage)
})
afterAll(() => db.close())
beforeEach(async () => {
  await db.buffers.clear()
  vi.clearAllMocks()
})

const setup = async () => {
  const view = createDefaultNotebookViewState()
  view.cells[0].value = "select 1"
  const label = "Monitoring"
  const monitoring = {
    target: { instanceKey: "instance", kind: "table" as const, name: "trades" },
    templateVersion: 1,
    initialFingerprint: monitoringFingerprint(label, view),
  }
  const id = await db.buffers.add(
    makeBuffer({ label, position: 0, notebookViewState: view, monitoring }),
  )
  return { id, view, monitoring }
}

describe("monitoring customization telemetry", () => {
  it("ignores query status, focus, inspection, automatic sizing and archive changes", async () => {
    const { id, view } = await setup()
    await bufferStore.update(id, {
      notebookViewState: {
        ...view,
        focusedCellId: view.cells[0].id,
        cells: view.cells.map((cell) => ({
          ...cell,
          lastRunStatus: "success",
          paneView: "result",
          bottomHeight: 154,
        })),
      },
    })
    await bufferStore.update(id, { archived: true })
    expect(trackEvent).not.toHaveBeenCalled()
    expect((await db.buffers.get(id))?.monitoring?.customizedAt).toBeUndefined()
  })

  it("records one durable edit across concurrent writers and keeps the target association", async () => {
    const { id, monitoring } = await setup()
    await Promise.all([
      bufferStore.update(id, { label: "My dashboard" }),
      bufferStore.update(id, { label: "My monitoring" }),
    ])
    const stored = await db.buffers.get(id)
    expect(stored?.monitoring).toMatchObject(monitoring)
    expect(stored?.monitoring?.customizedAt).toEqual(expect.any(Number))
    expect(trackEvent).toHaveBeenCalledTimes(1)
    expect(trackEvent).toHaveBeenCalledWith(
      ConsoleEvent.NOTEBOOK_TEMPLATE_CUSTOMIZE,
      {
        notebookId: id,
        source: "table_monitoring",
        kind: "table",
        templateVersion: 1,
      },
    )
    // Undo does not turn a user's notebook back into a disposable template.
    await bufferStore.update(id, { label: "Monitoring" })
    expect(isUnmodifiedMonitoring((await db.buffers.get(id))!)).toBe(false)
    expect(trackEvent).toHaveBeenCalledTimes(1)
  })

  it("also observes passive MCP commits within their enclosing transaction", async () => {
    const { id, view } = await setup()
    view.cells[0].value = "select 2"
    expect(await commitView(id, partsOf(view))).toBe("committed")
    cancelPendingSearchPublish(id)
    expect(trackEvent).toHaveBeenCalledTimes(1)
    expect((await db.buffers.get(id))?.monitoring?.customizedAt).toEqual(
      expect.any(Number),
    )
  })

  it("does not report or retain an edit when the enclosing transaction rolls back", async () => {
    const { id } = await setup()
    await expect(
      db.transaction("rw", db.buffers, async () => {
        await bufferStore.update(id, { label: "Rolled back" })
        expect(trackEvent).not.toHaveBeenCalled()
        throw new Error("abort")
      }),
    ).rejects.toThrow("abort")
    expect(trackEvent).not.toHaveBeenCalled()
    expect((await db.buffers.get(id))?.monitoring?.customizedAt).toBeUndefined()
  })

  it("records column-only customization once, including concurrent document edits", async () => {
    const { id } = await setup()
    await Promise.all([
      markMonitoringColumnsCustomized(id),
      bufferStore.update(id, { label: "Columns changed" }),
    ])
    await markMonitoringColumnsCustomized(id)
    expect(trackEvent).toHaveBeenCalledTimes(1)
  })

  it("never treats regular notebooks or missing buffers as template conversions", async () => {
    const id = await db.buffers.add(
      makeBuffer({
        label: "User notebook",
        position: 0,
        notebookViewState: createDefaultNotebookViewState(),
      }),
    )
    await bufferStore.update(id, { label: "Edited" })
    await markMonitoringColumnsCustomized(id)
    expect(await bufferStore.update(id + 1, { label: "Deleted" })).toBe(0)
    expect(trackEvent).not.toHaveBeenCalled()
  })
})
