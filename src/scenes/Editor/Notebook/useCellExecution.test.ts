import { describe, expect, it } from "vitest"
import { abortCellRunsOnUnmount } from "./useCellExecution"

describe("abortCellRunsOnUnmount", () => {
  it("aborts validation and request phases before clearing their registries", () => {
    const validation = new AbortController()
    const request = new AbortController()
    const barriers = new Map([["cell", new Set([validation])]])
    const requests = new Map([["cell", [request]]])
    const generations = new Map([["cell", 4]])

    abortCellRunsOnUnmount(barriers, requests, generations)

    expect(validation.signal.aborted).toBe(true)
    expect(request.signal.aborted).toBe(true)
    expect(barriers.size).toBe(0)
    expect(requests.size).toBe(0)
    expect(generations.get("cell")).toBe(5)
  })

  it("supersedes a validation-only cell so it cannot launch after teardown", () => {
    const validation = new AbortController()
    const barriers = new Map([["validating", new Set([validation])]])
    const generations = new Map<string, number>()

    abortCellRunsOnUnmount(barriers, new Map(), generations)

    expect(validation.signal.aborted).toBe(true)
    expect(generations.get("validating")).toBe(1)
  })
})
