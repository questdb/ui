import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { QueryExecResult } from "../../../../hooks/useQueryExecution"
import type {
  CellResult,
  NotebookCell,
  SingleQueryResult,
} from "../../../../store/notebook"
import { clearStatementClassCache } from "../../../../utils/tools/permissions"

let formatterCalls = 0
vi.mock("@questdb/sql-parser", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@questdb/sql-parser")>()
  return {
    ...actual,
    format: (...args: Parameters<typeof actual.format>) => {
      formatterCalls++
      return actual.format(...args)
    },
  }
})

import {
  CellRefreshEngine,
  pendingCellFetchState,
  type CellRefreshDeps,
} from "./cellRefreshEngine"
import { computeResultBottomHeight } from "../cellSizing"
import {
  deriveStatementFrame,
  reconcileCellResultForValue,
  statementKeysFor,
} from "../statementIdentity"
import { toChartResult } from "../DrawCanvas/drawCanvasUtils"
import { CellResultHydrationEngine } from "../resultHydration/cellResultHydration"
import {
  getChartZoom,
  setChartZoom,
} from "../cellVirtualization/chartZoomStore"

// The formatter is the only expensive step of statement identity. Every event
// below must key each statement list at most once and each result frame at
// most once, so the ceilings are small multiples of the statement count.
const N = 5
const statements = Array.from({ length: N }, (_, i) => `select ${i + 1}`)
const edited = statements.map((s, i) => (i === 2 ? "select 33" : s))
const sqlOf = (list: string[]) => list.join(";\n")

const execResult = (query: string): QueryExecResult => ({
  type: "dql",
  query,
  columns: [{ name: "x", type: "INT" }],
  dataset: [[1]],
  count: 1,
})

const frameOf = (list: string[]): CellResult => ({
  results: list.map(
    (query) =>
      ({
        type: "dql",
        query,
        columns: [{ name: "x", type: "INT" }],
        dataset: [[1]],
        count: 1,
        timestamp: 0,
      }) as unknown as SingleQueryResult,
  ),
  activeResultIndex: 0,
  timestamp: 0,
})

const fakeDocument = Object.assign(new EventTarget(), { hidden: false })

const flush = async () => {
  await vi.advanceTimersByTimeAsync(0)
}

const countFormatterCalls = async (run: () => Promise<void> | void) => {
  formatterCalls = 0
  await run()
  await flush()
  return formatterCalls
}

describe("statement identity passes per event", () => {
  let cellResults: Map<string, CellResult | undefined>
  let deps: CellRefreshDeps
  let engine: CellRefreshEngine

  beforeEach(() => {
    vi.useFakeTimers()
    clearStatementClassCache()
    ;(globalThis as { document?: unknown }).document = fakeDocument
    cellResults = new Map()
    deps = {
      executeSingle: vi.fn((sql: string) => Promise.resolve(execResult(sql))),
      validateWithGlobals: vi
        .fn()
        .mockResolvedValue({ query: "q", columns: [], timestamp: 0 }),
      setCellResult: vi.fn((id: string, result: CellResult | undefined) => {
        cellResults.set(id, result)
      }),
      getCellResult: vi.fn((id: string) => cellResults.get(id)),
      isDrawCell: vi.fn(() => false),
      isCellRunning: vi.fn(() => false),
      resultLoadStatus: vi.fn(() => "loaded"),
      subscribeResultLoad: vi.fn(() => () => undefined),
      requestResultLoad: vi.fn(),
      noteResultMissing: vi.fn(),
      reviveResultLoad: vi.fn(),
      onSnapshotPersisted: vi.fn(),
    } as unknown as CellRefreshDeps
    engine = new CellRefreshEngine(1, () => deps, { initialFetchJitterMs: 0 })
    engine.attach()
  })

  afterEach(() => {
    engine.destroy()
    delete (globalThis as { document?: unknown }).document
    vi.useRealTimers()
  })

  it("keys a grid cell never per refresh round and once per edit", async () => {
    // Given an on-screen grid cell with a settled frame
    const gridCell = (value: string): NotebookCell =>
      ({
        id: "c1",
        position: 0,
        value,
        result: cellResults.get("c1"),
      }) as NotebookCell
    cellResults.set("c1", frameOf(statements))
    engine.setVisible("c1", true)
    engine.sync([gridCell(sqlOf(statements))])
    engine.getState("c1")
    await flush()

    // When the cell is refreshed by hand with unchanged text
    const refreshCalls = await countFormatterCalls(() => engine.refresh("c1"))

    // Then nothing is keyed: the frame was written for these statements
    expect(refreshCalls).toBe(0)

    // When one statement is edited and the debounce fires
    const editCalls = await countFormatterCalls(async () => {
      engine.sync([gridCell(sqlOf(edited))])
      await vi.advanceTimersByTimeAsync(301)
    })

    // Then only the new list is keyed: the old frame was written for the
    // statements the entry held until the edit
    expect(editCalls).toBe(N)
  })

  it("keys a chart cell at most four times per edit", async () => {
    // Given an on-screen draw cell with auto-refresh off
    ;(deps.isDrawCell as ReturnType<typeof vi.fn>).mockReturnValue(true)
    const drawCell = (value: string): NotebookCell =>
      ({
        id: "c2",
        position: 0,
        value,
        mode: "draw",
        autoRefresh: false,
      }) as NotebookCell
    engine.setVisible("c2", true)

    // When it settles for the first time
    const settleCalls = await countFormatterCalls(() => {
      engine.sync([drawCell(sqlOf(statements))])
    })

    // Then the statement list is keyed once
    expect(settleCalls).toBeLessThanOrEqual(N)

    // When one statement is edited and the settle round fetches only it
    const editCalls = await countFormatterCalls(async () => {
      engine.sync([drawCell(sqlOf(edited))])
      await vi.advanceTimersByTimeAsync(301)
    })

    // Then the list, the stale check, and the carry map are each keyed once
    expect(editCalls).toBeLessThanOrEqual(4 * N + 2)

    // When it is refreshed by hand with unchanged text
    const refreshCalls = await countFormatterCalls(() => engine.refresh("c2"))

    // Then nothing is keyed: the frame was written for these statements
    expect(refreshCalls).toBe(0)
  })

  it("keys no entry while a notebook opens until its state is read", async () => {
    // Given run cells with a result marker, off screen
    const runCell = (id: string): NotebookCell =>
      ({
        id,
        position: 0,
        value: sqlOf(statements),
        lastRunStatus: "success",
      }) as NotebookCell

    // When the engine syncs them
    const openCalls = await countFormatterCalls(() => {
      engine.sync([runCell("c1"), runCell("c2"), runCell("c3")])
    })

    // Then the formatter never runs
    expect(openCalls).toBe(0)

    // When a mounted cell reads its state twice
    const readCalls = await countFormatterCalls(() => {
      engine.getState("c1")
      engine.getState("c1")
    })

    // Then only that cell is keyed, once
    expect(readCalls).toBe(N)
    expect(engine.getState("c1")?.slotKeys).toEqual(
      statementKeysFor(statements),
    )
  })

  it("builds a chart's pending state without the formatter", async () => {
    // Given a draw cell that mounts before the engine holds its entry

    // When the chart derives its pending state from the SQL it shows
    const calls = await countFormatterCalls(() => {
      pendingCellFetchState(sqlOf(statements))
    })

    // Then no statement is keyed: the loading derivation reads no slot keys
    expect(calls).toBe(0)
  })

  it("resets the zoom of an unread chart only when its statements change", async () => {
    // Given a zoomed, off-screen draw cell that was never read
    const drawCell = (value: string): NotebookCell =>
      ({
        id: "c2",
        position: 0,
        value,
        mode: "draw",
        autoRefresh: false,
      }) as NotebookCell
    engine.sync([drawCell(sqlOf(statements))])
    setChartZoom("c2", 20, 60)

    // When one statement changes only its casing
    engine.sync([
      drawCell(
        sqlOf(statements.map((s, i) => (i === 0 ? s.toUpperCase() : s))),
      ),
    ])
    await vi.advanceTimersByTimeAsync(301)

    // Then the zoom stays
    expect(getChartZoom("c2")).toEqual({ start: 20, end: 60 })

    // When one statement changes its content
    engine.sync([drawCell(sqlOf(edited))])
    await vi.advanceTimersByTimeAsync(301)

    // Then the zoom resets
    expect(getChartZoom("c2")).toBeUndefined()
  })

  it("keys only the statements when a snapshot written for them hydrates", async () => {
    // Given a run cell whose stored snapshot was written for its statements
    const cell = {
      id: "c1",
      position: 0,
      value: sqlOf(statements),
      lastRunStatus: "success",
    } as NotebookCell
    const stored = frameOf(statements).results.map((result) => ({
      ...result,
      fetchedAt: 500,
    }))
    const hydration = new CellResultHydrationEngine({
      loadSnapshot: () =>
        Promise.resolve({
          bufferId: 1,
          cellId: "c1",
          results: stored,
          savedAt: 1000,
        }),
      rewriteSnapshot: () => Promise.resolve(true),
      deleteSnapshot: () => Promise.resolve(),
      getCell: () => cell,
      applyResult: vi.fn(),
      releaseResult: vi.fn(),
      canRelease: () => false,
      seedRefreshState: vi.fn(),
    })

    // When the cell hydrates
    const calls = await countFormatterCalls(() => hydration.request("c1"))

    // Then the statements are keyed once and the results take their keys
    expect(calls).toBe(N)
    expect(hydration.statusOf("c1")).toBe("loaded")
    hydration.destroy()
  })

  it("keeps a frame a run wrote inside the edit debounce, whatever the duplicates' casing", async () => {
    // Given a settled grid cell holding three case-variant duplicates
    const before = ["select 1", "SELECT 1", "select 1"]
    const after = ["select 1", "select 1"]
    const gridCell = (value: string): NotebookCell =>
      ({
        id: "c1",
        position: 0,
        value,
        result: cellResults.get("c1"),
      }) as NotebookCell
    cellResults.set("c1", frameOf(before))
    engine.setVisible("c1", true)
    engine.sync([gridCell(sqlOf(before))])
    await flush()

    // When the middle statement is deleted and a run lands before the
    // debounce adopts the new text
    cellResults.set("c1", frameOf(after))
    engine.sync([gridCell(sqlOf(after))])
    await vi.advanceTimersByTimeAsync(301)

    // Then both results survive under the two remaining statements: the old
    // list never keys a frame it did not write
    expect(cellResults.get("c1")?.results.map((r) => r.query)).toEqual(after)
  })

  it("keys nothing on the render paths for a frame written for the current statements", async () => {
    // Given the engine's keys for the statements and a frame they claim by text
    const slotKeys = statementKeysFor(statements)
    const frame = frameOf(statements)

    // When the tab frame, the chart match and the default height derive from it
    const calls = await countFormatterCalls(() => {
      deriveStatementFrame(statements, frame, slotKeys)
      toChartResult(frame, statements)
      computeResultBottomHeight(frame, sqlOf(statements))
    })

    // Then the formatter never runs
    expect(calls).toBe(0)
  })

  it("keys only the frame when other text wrote it", async () => {
    // Given the engine's keys and a frame written in another casing
    const slotKeys = statementKeysFor(statements)
    const frame = frameOf(statements.map((s) => s.toUpperCase()))

    // When the tab frame derives from it
    const calls = await countFormatterCalls(() => {
      deriveStatementFrame(statements, frame, slotKeys)
    })

    // Then the frame is keyed once and the statement list not at all
    expect(calls).toBe(N)
  })

  it("keys statements and results once each in the edit reconcile", async () => {
    // Given a frame that matches its statements
    const frame = frameOf(statements)

    // When the edit reconcile derives from it
    const reconcileCalls = await countFormatterCalls(() => {
      reconcileCellResultForValue(frame, sqlOf(statements))
    })

    // Then it keys the statement list once and the frame once
    expect(reconcileCalls).toBe(2 * N)
  })
})
