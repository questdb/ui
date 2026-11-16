// @vitest-environment jsdom
import "fake-indexeddb/auto"
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import { db } from "../../store/db"
import { makeBuffer, type Buffer } from "../../store/buffers"
import {
  openMonitoringDashboard,
  type MonitoringRequest,
} from "./openDashboard"

vi.hoisted(() => {
  const { jsdom } = globalThis as typeof globalThis & {
    jsdom: { window: Window }
  }
  vi.stubGlobal("localStorage", jsdom.window.localStorage)
})
afterAll(() => db.close())

const request: MonitoringRequest = {
  target: { instanceKey: "instance-a", tableId: 7, kind: "table" },
  name: "trades",
  telemetryEnabled: true,
  walEnabled: true,
}
const add = vi.fn(async (partial?: Partial<Buffer>) => {
  const buffer = makeBuffer({
    ...partial,
    label: partial?.label ?? "Notebook",
    position: 0,
  })
  const id = await db.buffers.add(buffer)
  return { ...buffer, id }
})
beforeEach(async () => {
  await db.buffers.clear()
  add.mockClear()
})

describe("opening a monitoring dashboard", () => {
  it("coalesces five concurrent clicks and reuses persisted state on later clicks", async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () => openMonitoringDashboard(request, add)),
    )
    expect(add).toHaveBeenCalledTimes(1)
    expect(new Set(results.map((r) => r?.buffer.id)).size).toBe(1)
    expect((await openMonitoringDashboard(request, add))?.outcome).toBe(
      "reused",
    )
    expect(await db.buffers.count()).toBe(1)
  })

  it("restores the edited dashboard, preserving its name, SQL and association", async () => {
    const first = await openMonitoringDashboard(request, add)
    const view = structuredClone(first!.buffer.notebookViewState!)
    view.cells[1].value = "select 42"
    view.settings!.variables![0].value = "90"
    await db.buffers.update(first!.buffer.id!, {
      label: "My investigation",
      notebookViewState: view,
      archived: true,
      position: -1,
    })
    await db.buffers.add(makeBuffer({ label: "SQL", position: 8 }))
    const reopened = await openMonitoringDashboard(
      {
        ...request,
        refreshSchedule: {
          refresh_type: "timer",
          timer_interval: 1,
          timer_interval_unit: "HOUR",
        },
      },
      add,
    )
    expect(reopened?.outcome).toBe("restored")
    expect(reopened?.buffer.id).toBe(first?.buffer.id)
    expect(reopened?.buffer.position).toBe(9)
    expect(reopened?.buffer.label).toBe("My investigation")
    expect(reopened?.buffer.notebookViewState?.cells[1].value).toBe("select 42")
    expect(
      reopened?.buffer.notebookViewState?.settings?.variables?.[0].value,
    ).toBe("90")
    expect(reopened?.buffer.monitoring?.target).toEqual(request.target)
    expect(add).toHaveBeenCalledTimes(1)
  })

  it("isolates instances and drop/recreated tables instead of matching notebook names", async () => {
    const first = await openMonitoringDashboard(request, add)
    const otherInstance = await openMonitoringDashboard(
      { ...request, target: { ...request.target, instanceKey: "instance-b" } },
      add,
    )
    const recreated = await openMonitoringDashboard(
      { ...request, target: { ...request.target, tableId: 8 } },
      add,
    )
    expect(
      new Set([
        first?.buffer.id,
        otherInstance?.buffer.id,
        recreated?.buffer.id,
      ]).size,
    ).toBe(3)
  })

  it("does not adopt an independent copy or an ordinary notebook with the same name", async () => {
    const first = await openMonitoringDashboard(request, add)
    const copy = makeBuffer({
      label: first!.buffer.label,
      notebookViewState: first!.buffer.notebookViewState,
      position: 1,
    })
    const copyId = await db.buffers.add(copy)
    expect(copy.monitoring).toBeUndefined()
    await db.buffers.delete(first!.buffer.id!)
    const next = await openMonitoringDashboard(request, add)
    expect(next?.buffer.id).not.toBe(copyId)
    expect(next?.outcome).toBe("created")
  })

  it("allows a retry after creation fails", async () => {
    const fail = vi.fn().mockRejectedValue(new Error("storage failed"))
    await expect(openMonitoringDashboard(request, fail)).rejects.toThrow(
      "storage failed",
    )
    expect((await openMonitoringDashboard(request, add))?.outcome).toBe(
      "created",
    )
  })
})
