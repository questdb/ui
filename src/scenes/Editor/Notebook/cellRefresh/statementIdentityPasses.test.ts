import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { QueryExecResult } from "../../../../hooks/useQueryExecution"
import type {
  CellResult,
  NotebookCell,
  SingleQueryResult,
} from "../../../../store/notebook"
import { clearStatementClassCache } from "../../../../utils/tools/permissions"

let formatterCalls = 0
vi.mock("../../../../utils/formatSql", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../../utils/formatSql")>()
  return {
    ...actual,
    formatSql: (...args: Parameters<typeof actual.formatSql>) => {
      formatterCalls++
      return actual.formatSql(...args)
    },
  }
})

import { CellRefreshEngine, type CellRefreshDeps } from "./cellRefreshEngine"
import {
  deriveStatementFrame,
  reconcileCellResultForValue,
} from "../notebookUtils"

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

  it("keys a grid cell once per refresh round and twice per edit", async () => {
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
    await flush()

    // When the cell is refreshed by hand with unchanged text
    const refreshCalls = await countFormatterCalls(() => engine.refresh("c1"))

    // Then only the frame is keyed: the statement list came with the entry
    expect(refreshCalls).toBeLessThanOrEqual(N)

    // When one statement is edited and the debounce fires
    const editCalls = await countFormatterCalls(async () => {
      engine.sync([gridCell(sqlOf(edited))])
      await vi.advanceTimersByTimeAsync(301)
    })

    // Then the new list and the old frame are keyed once each
    expect(editCalls).toBeLessThanOrEqual(2 * N)
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
  })

  it("keys statements and results once each in the pure helpers", async () => {
    // Given a frame that matches its statements
    const frame = frameOf(statements)

    // When the tab frame and the edit reconcile derive from it
    const frameCalls = await countFormatterCalls(() => {
      deriveStatementFrame(statements, frame)
    })
    const reconcileCalls = await countFormatterCalls(() => {
      reconcileCellResultForValue(frame, sqlOf(statements))
    })

    // Then each keys the statement list once and the frame once
    expect(frameCalls).toBe(2 * N)
    expect(reconcileCalls).toBe(2 * N)
  })
})
