import { describe, expect, it, vi } from "vitest"
import type { QueryExecResult } from "../../../hooks/useQueryExecution"
import {
  MAX_ACTIVE_STATEMENT_REQUESTS,
  statementRequestLimiter,
} from "../../../utils/questdb/requestLimiter"
import { abortCellRunsOnUnmount, launchStatement } from "./useCellExecution"

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

  it("cancels a saturated statement queue without disturbing another notebook", async () => {
    const holds = Array.from({ length: MAX_ACTIVE_STATEMENT_REQUESTS }, () => {
      let release!: () => void
      const promise = new Promise<void>((resolve) => {
        release = resolve
      })
      return { promise, release }
    })
    const occupied = holds.map((hold) =>
      statementRequestLimiter(() => hold.promise),
    )
    const validation = new AbortController()
    const validate = vi.fn(() => Promise.resolve())
    const validations = Promise.allSettled(
      Array.from({ length: 8 }, () =>
        statementRequestLimiter(validate, validation.signal),
      ),
    )
    const controllers = Array.from(
      { length: 1_024 },
      () => new AbortController(),
    )
    const execute = vi.fn<[], Promise<QueryExecResult>>()
    const queued = controllers.map((controller, index) =>
      launchStatement(execute, controller.signal, `select ${index}`),
    )
    const unrelatedTask = vi.fn(() => Promise.resolve("other-notebook"))
    const unrelated = statementRequestLimiter(unrelatedTask)
    const barriers = new Map([["validating", new Set([validation])]])
    const requests = new Map([["running", controllers]])
    const generations = new Map([
      ["validating", 4],
      ["running", 9],
    ])

    try {
      abortCellRunsOnUnmount(barriers, requests, generations)

      expect(generations.get("validating")).toBe(5)
      expect(generations.get("running")).toBe(10)
      expect(barriers.size).toBe(0)
      expect(requests.size).toBe(0)
      expect(await Promise.all(queued)).toEqual(
        controllers.map(() => ({ launched: false })),
      )
      for (const outcome of await validations) {
        expect(outcome).toMatchObject({
          status: "rejected",
          reason: { name: "AbortError" },
        })
      }
      expect(validate).not.toHaveBeenCalled()
      expect(execute).not.toHaveBeenCalled()
      expect(unrelatedTask).not.toHaveBeenCalled()
    } finally {
      holds.forEach((hold) => hold.release())
      await Promise.all(occupied)
    }

    await expect(unrelated).resolves.toBe("other-notebook")
    expect(unrelatedTask).toHaveBeenCalledOnce()
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
