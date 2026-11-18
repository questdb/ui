// @vitest-environment jsdom
import "fake-indexeddb/auto"
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import { db } from "../../store/db"
import { bufferStore, makeBuffer, type Buffer } from "../../store/buffers"
import type {
  CellRunOutcome,
  runCellsAfterApply,
} from "../notebooks/runCellsAfterApply"
import { MOUNTED_MID_RUN_NOTE } from "../../scenes/Editor/Notebook/notebookUtils"
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

const runner = vi.hoisted(() => ({
  run: vi.fn<
    Parameters<typeof runCellsAfterApply>,
    ReturnType<typeof runCellsAfterApply>
  >(),
}))
vi.mock("../notebooks/runCellsAfterApply", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../notebooks/runCellsAfterApply")>()),
  runCellsAfterApply: runner.run,
}))

const request: MonitoringRequest = {
  target: { instanceKey: "instance-a", kind: "table", name: "trades" },
  telemetryEnabled: true,
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
const summary = (note?: string) => ({
  success: true,
  queryCount: 1,
  results: [],
  ...(note ? { unverified: true, note } : {}),
})
// A committed run stamps run history on its cells, as the real runner does.
const commitRuns = async (
  bufferId: number,
  cells: Array<{ cellId: string }>,
): Promise<CellRunOutcome[]> => {
  const ran = new Set(cells.map((c) => c.cellId))
  const view = (await db.buffers.get(bufferId))!.notebookViewState!
  await db.buffers.update(bufferId, {
    notebookViewState: {
      ...view,
      cells: view.cells.map((cell) =>
        ran.has(cell.id)
          ? { ...cell, lastRunStatus: "success" as const }
          : cell,
      ),
    },
  })
  return cells.map(({ cellId }) => ({ cellId, summary: summary() }))
}
beforeEach(async () => {
  await db.buffers.clear()
  add.mockClear()
  runner.run.mockReset().mockImplementation(commitRuns)
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

  it("opens a fresh dashboard once the previous one was edited, keeping the edited one", async () => {
    const first = await openMonitoringDashboard(request, add)
    const view = structuredClone(first!.buffer.notebookViewState!)
    view.cells[1].value = "select 42"
    await bufferStore.update(first!.buffer.id!, {
      label: "My investigation",
      notebookViewState: view,
    })
    const reopened = await openMonitoringDashboard(request, add)
    expect(reopened?.outcome).toBe("created")
    expect(reopened?.buffer.id).not.toBe(first?.buffer.id)
    expect(reopened?.buffer.label).toBe("trades · monitoring")
    const mine = await db.buffers.get(first!.buffer.id!)
    expect(mine?.label).toBe("My investigation")
    expect(mine?.notebookViewState?.cells[1].value).toBe("select 42")
    expect(mine).not.toHaveProperty("monitoring")
  })

  it("never restores an archived dashboard, even an unedited one", async () => {
    const first = await openMonitoringDashboard(request, add)
    // Archives detach the dashboard; a row archived with its association
    // (stored before that rule) must not be revived either.
    await db.buffers.update(first!.buffer.id!, { archived: true, position: -1 })
    const reopened = await openMonitoringDashboard(request, add)
    expect(reopened?.outcome).toBe("created")
    expect(reopened?.buffer.id).not.toBe(first?.buffer.id)
    expect((await db.buffers.get(first!.buffer.id!))?.archived).toBe(true)
  })

  it("runs a created dashboard's grid cells once, like an applied agent notebook", async () => {
    const onProgress = vi.fn()
    const created = await openMonitoringDashboard(request, add, onProgress)
    expect(onProgress).toHaveBeenCalledTimes(1)
    expect(runner.run).toHaveBeenCalledTimes(1)
    const [bufferId, cells, signal, gate] = runner.run.mock.calls[0]
    expect(bufferId).toBe(created?.buffer.id)
    expect(signal).toBeInstanceOf(AbortSignal)
    expect(gate).toEqual({ kind: "autoRun", source: "monitoring" })
    // Grid SQL cells only: charts draw themselves, markdown is prose.
    const view = created!.buffer.notebookViewState!
    const grids = view.cells.filter(
      (cell) => cell.type !== "markdown" && cell.mode !== "draw",
    )
    expect(grids.length).toBeGreaterThan(0)
    expect(cells).toEqual(
      grids.map((cell) => ({ cellId: cell.id, sql: cell.value })),
    )

    // Reusing the open dashboard runs nothing and reports no creation.
    expect(
      (await openMonitoringDashboard(request, add, onProgress))?.outcome,
    ).toBe("reused")
    expect(runner.run).toHaveBeenCalledTimes(1)
    expect(onProgress).toHaveBeenCalledTimes(1)
  })

  // The tab is in the tab bar while the first runs are in flight. Opening it
  // then refuses those runs' background results; nothing else would ever run
  // the cells, so the open runs them again, now in the open notebook.
  it("runs again the cells whose first run the user interrupted by opening the tab", async () => {
    runner.run.mockImplementationOnce((_bufferId, cells) =>
      Promise.resolve(
        cells.map(
          ({ cellId }, index): CellRunOutcome => ({
            cellId,
            summary: summary(index === 0 ? MOUNTED_MID_RUN_NOTE : undefined),
          }),
        ),
      ),
    )
    runner.run.mockImplementationOnce((_bufferId, cells) =>
      Promise.resolve(
        cells.map(
          ({ cellId }): CellRunOutcome => ({ cellId, summary: summary() }),
        ),
      ),
    )
    const created = await openMonitoringDashboard(request, add)
    expect(runner.run).toHaveBeenCalledTimes(2)
    const [firstCells] = [runner.run.mock.calls[0][1]]
    const [, retriedCells, , gate] = runner.run.mock.calls[1]
    expect(retriedCells).toEqual([firstCells[0]])
    expect(gate).toEqual({ kind: "autoRun", source: "monitoring" })
    expect(created?.runs).toHaveLength(firstCells.length)
    expect(
      created?.runs?.every(
        (run) => "summary" in run && !run.summary.unverified,
      ),
    ).toBe(true)
  })

  it("does not run again an interrupted cell once the user closed the dashboard", async () => {
    for (const close of [
      (id: number) => db.buffers.delete(id),
      (id: number) => db.buffers.update(id, { archived: true, position: -1 }),
    ]) {
      runner.run.mockReset().mockImplementationOnce(async (bufferId, cells) => {
        await close(bufferId)
        return cells.map(
          ({ cellId }, index): CellRunOutcome => ({
            cellId,
            summary: summary(index === 0 ? MOUNTED_MID_RUN_NOTE : undefined),
          }),
        )
      })
      await db.buffers.clear()
      const created = await openMonitoringDashboard(request, add)
      expect(runner.run).toHaveBeenCalledTimes(1)
      const first = created?.runs?.[0]
      expect(first && "summary" in first && first.summary.unverified).toBe(true)
    }
  })

  // The buffer is saved before its first runs. A reload or session end during
  // them leaves cells that nothing else would ever run.
  it("runs a reused dashboard's grid cells whose first run never landed", async () => {
    runner.run.mockResolvedValueOnce([])
    const created = await openMonitoringDashboard(request, add)
    const id = created!.buffer.id!
    const view = (await db.buffers.get(id))!.notebookViewState!
    const grids = view.cells.filter(
      (cell) => cell.type !== "markdown" && cell.mode !== "draw",
    )
    expect(grids.length).toBeGreaterThan(1)
    // A failed run is run history too: it is not repeated.
    await db.buffers.update(id, {
      notebookViewState: {
        ...view,
        cells: view.cells.map((cell) =>
          cell.id === grids[0].id
            ? { ...cell, lastRunStatus: "error" as const }
            : cell,
        ),
      },
    })

    const onProgress = vi.fn()
    const reused = await openMonitoringDashboard(request, add, onProgress)
    expect(reused?.outcome).toBe("reused")
    expect(reused?.buffer.id).toBe(id)
    expect(onProgress).toHaveBeenCalledTimes(1)
    expect(runner.run).toHaveBeenCalledTimes(2)
    const [bufferId, cells, , gate] = runner.run.mock.calls[1]
    expect(bufferId).toBe(id)
    expect(gate).toEqual({ kind: "autoRun", source: "monitoring" })
    expect(cells).toEqual(
      grids.slice(1).map((cell) => ({ cellId: cell.id, sql: cell.value })),
    )
    expect(reused?.runs).toHaveLength(grids.length - 1)

    // Once they ran, reusing it runs nothing and shows no progress.
    const again = await openMonitoringDashboard(request, add, onProgress)
    expect(again?.outcome).toBe("reused")
    expect(again?.runs).toBeUndefined()
    expect(runner.run).toHaveBeenCalledTimes(2)
    expect(onProgress).toHaveBeenCalledTimes(1)
  })

  it("isolates instances, kinds and names", async () => {
    const first = await openMonitoringDashboard(request, add)
    const ids = [first?.buffer.id]
    for (const target of [
      { ...request.target, instanceKey: "instance-b" },
      { ...request.target, kind: "matview" as const },
      { ...request.target, name: "trades_renamed" },
    ]) {
      ids.push(
        (await openMonitoringDashboard({ ...request, target }, add))?.buffer.id,
      )
    }
    expect(new Set(ids).size).toBe(4)
  })

  it("reuses the dashboard for a re-created table and ignores name case", async () => {
    const first = await openMonitoringDashboard(request, add)
    const again = await openMonitoringDashboard(
      { ...request, target: { ...request.target, name: "TRADES" } },
      add,
    )
    expect(again?.outcome).toBe("reused")
    expect(again?.buffer.id).toBe(first?.buffer.id)
  })

  it("opens a new dashboard after a rename, whose SQL targets the new name", async () => {
    await openMonitoringDashboard(request, add)
    const renamed = await openMonitoringDashboard(
      { ...request, target: { ...request.target, name: "trades_v2" } },
      add,
    )
    expect(renamed?.outcome).toBe("created")
    expect(renamed?.buffer.label).toBe("trades_v2 · monitoring")
    const sql = renamed!.buffer
      .notebookViewState!.cells.filter((c) => c.type !== "markdown")
      .map((c) => c.value)
    expect(sql.every((value) => value.includes("'trades_v2'"))).toBe(true)
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
