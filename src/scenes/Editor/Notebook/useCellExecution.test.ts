import { createElement } from "react"
import { act, create } from "react-test-renderer"
import { describe, expect, it, vi } from "vitest"
import type { QueryExecResult } from "../../../hooks/useQueryExecution"
import { authSessionState } from "../../../modules/OAuth2/authSessionState"
import { SESSION_ENDED_MESSAGE } from "../../../modules/OAuth2/session"
import type { CellResult, NotebookCell } from "../../../store/notebook"
import {
  MAX_ACTIVE_STATEMENT_REQUESTS,
  statementRequestLimiter,
} from "../../../utils/questdb/requestLimiter"
import { persistCellSnapshot } from "./persistCellSnapshot"
import {
  abortCellRunsOnUnmount,
  launchStatement,
  useCellExecution,
} from "./useCellExecution"

vi.mock("./persistCellSnapshot", () => ({
  persistCellSnapshot: vi.fn().mockResolvedValue(true),
}))

describe("useCellExecution at session end", () => {
  it("drops a run aborted by the session end instead of recording it", async () => {
    // Given a cell with a last good result, re-run with a statement in flight
    const sql = "insert into trades values (1)"
    const lastGood: CellResult = {
      results: [{ type: "dml", query: sql, fetchedAt: 1 }],
      activeResultIndex: 0,
      timestamp: 1,
    }
    const cellsRef = {
      current: [
        { id: "c1", position: 0, value: sql, result: lastGood },
      ] as NotebookCell[],
    }
    let finish!: (exec: QueryExecResult) => void
    const executeSingle = vi.fn(
      () =>
        new Promise<QueryExecResult>((resolve) => {
          finish = resolve
        }),
    )
    const updateCell = vi.fn(
      (cellId: string, updates: Partial<NotebookCell>) => {
        cellsRef.current = cellsRef.current.map((cell) =>
          cell.id === cellId ? { ...cell, ...updates } : cell,
        )
      },
    )
    let runCell!: ReturnType<typeof useCellExecution>["runCell"]
    const Harness = () => {
      runCell = useCellExecution({
        bufferId: 1,
        cellsRef,
        executeSingle,
        validateWithGlobals: vi.fn(),
        updateCellResult: vi.fn(),
        updateCell,
        updateCells: vi.fn(),
        setScriptSummary: vi.fn(),
        onSnapshotPersisted: vi.fn(),
      }).runCell
      return null
    }
    const renderer = create(createElement(Harness))
    const run = runCell("c1")
    await vi.waitFor(() => expect(executeSingle).toHaveBeenCalledOnce())
    expect(updateCell).toHaveBeenCalledOnce()

    // When logout ends the session before React unmounts the notebook, and
    // the aborted request settles
    act(() => authSessionState.endSession())
    finish({
      type: "error",
      query: sql,
      columns: [],
      dataset: [],
      count: 0,
      error: SESSION_ENDED_MESSAGE,
      sessionEnded: true,
    })

    // Then the run is superseded: the last good result and run history stay
    await expect(run).resolves.toMatchObject({ superseded: true })
    expect(updateCell).toHaveBeenCalledOnce()
    expect(persistCellSnapshot).not.toHaveBeenCalled()
    act(() => renderer.unmount())
  })
})

describe("abortCellRunsOnUnmount", () => {
  it("aborts validation and request phases before clearing their registries", () => {
    // Given a cell with a validation barrier, an in-flight request and a generation
    const validation = new AbortController()
    const request = new AbortController()
    const barriers = new Map([["cell", new Set([validation])]])
    const requests = new Map([["cell", [request]]])
    const generations = new Map([["cell", 4]])

    // When the hook tears down
    abortCellRunsOnUnmount(barriers, requests, generations)

    // Then both phases are aborted, the registries are empty and the generation advanced
    expect(validation.signal.aborted).toBe(true)
    expect(request.signal.aborted).toBe(true)
    expect(barriers.size).toBe(0)
    expect(requests.size).toBe(0)
    expect(generations.get("cell")).toBe(5)
  })

  it("supersedes a validation-only cell so it cannot launch after teardown", () => {
    // Given a cell that is still validating and has no generation yet
    const validation = new AbortController()
    const barriers = new Map([["validating", new Set([validation])]])
    const generations = new Map<string, number>()

    // When the hook tears down
    abortCellRunsOnUnmount(barriers, new Map(), generations)

    // Then the validation aborts and the cell gains a newer generation
    expect(validation.signal.aborted).toBe(true)
    expect(generations.get("validating")).toBe(1)
  })
})

describe("launchStatement", () => {
  it("reports a statement aborted while queued as not launched", async () => {
    // Given the limiter is saturated by requests that never settle
    const holds = Array.from({ length: MAX_ACTIVE_STATEMENT_REQUESTS }, () => {
      let release: () => void = () => {}
      const promise = new Promise<void>((resolve) => {
        release = resolve
      })
      return { promise, release }
    })
    const occupied = holds.map((hold) =>
      statementRequestLimiter(() => hold.promise),
    )
    const execute = vi.fn<[], Promise<QueryExecResult>>()
    const ac = new AbortController()

    // When a queued statement's signal aborts before a slot frees up
    const launch = launchStatement(execute, ac.signal, "select 1")
    ac.abort()

    // Then it never executed, so it is not launched
    await expect(launch).resolves.toEqual({ launched: false })
    expect(execute).not.toHaveBeenCalled()
    holds.forEach((hold) => hold.release())
    await Promise.all(occupied)
  })

  it("keeps the unverifiable cancelled error for a statement aborted after launch", async () => {
    // Given a statement whose request rejects once its signal aborts
    const ac = new AbortController()
    const execute = vi.fn(
      () =>
        new Promise<QueryExecResult>((_, reject) => {
          ac.signal.addEventListener("abort", () =>
            reject(new Error("aborted")),
          )
        }),
    )

    // When the abort lands mid-flight
    const launch = launchStatement(execute, ac.signal, "select 1")
    await vi.waitFor(() => expect(execute).toHaveBeenCalled())
    ac.abort()

    // Then the outcome is launched, carrying the error that marks it unverified
    await expect(launch).resolves.toMatchObject({
      launched: true,
      exec: { type: "error", error: "Cancelled by user" },
    })
  })
})
