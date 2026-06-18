import { describe, it, expect } from "vitest"
import type { ResultGridRow } from "../../components/ResultGrid"
import type { QueryRawResult } from "../../utils"
import { PAGE_SIZE } from "./nextPageWindow"
import type { PageFetchPlan } from "./pageFetchPlan"
import {
  applyFetchedPages,
  applyPageResponse,
  getRowFromCache,
  isPageEmpty,
  purgeOutlierPages,
  type PageCache,
} from "./pageCache"

const makeRows = (count: number, base = 0): ResultGridRow[] =>
  Array.from({ length: count }, (_, i) => [base + i])

describe("getRowFromCache", () => {
  it("reads a row from its page by absolute index", () => {
    // Given page 2 is cached
    const cache: PageCache = new Map([[2, makeRows(PAGE_SIZE, 2 * PAGE_SIZE)]])

    // When reading the first and last row of that page by absolute index
    // Then the page math maps each absolute index to the right slot
    expect(getRowFromCache(cache, 2 * PAGE_SIZE)).toEqual([2 * PAGE_SIZE])
    expect(getRowFromCache(cache, 3 * PAGE_SIZE - 1)).toEqual([
      3 * PAGE_SIZE - 1,
    ])
  })

  it("returns undefined when the row's page is not loaded", () => {
    // Given an empty cache
    const cache: PageCache = new Map()

    // When reading any row
    // Then it is reported as unloaded, distinct from a SQL null
    expect(getRowFromCache(cache, 5)).toBeUndefined()
  })
})

describe("isPageEmpty", () => {
  it("treats an absent page as empty", () => {
    expect(isPageEmpty(new Map(), 0)).toBe(true)
  })

  it("treats a zero-row page as empty", () => {
    // The phantom second slot of a short final pair is cached as []
    expect(isPageEmpty(new Map([[1, []]]), 1)).toBe(true)
  })

  it("treats a loaded page as not empty", () => {
    expect(isPageEmpty(new Map([[0, makeRows(1)]]), 0)).toBe(false)
  })
})

describe("purgeOutlierPages", () => {
  it("evicts pages outside the window and keeps the boundary pages", () => {
    // Given pages 0..4 cached and a window of [1, 3]
    const cache: PageCache = new Map(
      [0, 1, 2, 3, 4].map((p) => [p, makeRows(1, p)]),
    )

    // When purging outliers
    purgeOutlierPages(cache, 1, 3)

    // Then only the in-window pages survive
    expect(Array.from(cache.keys()).sort((a, b) => a - b)).toEqual([1, 2, 3])
  })

  it("never evicts a page that is still inside the visible window", () => {
    // Given the two pages spanned by a contiguous viewport
    const cache: PageCache = new Map([
      [1, makeRows(PAGE_SIZE, PAGE_SIZE)],
      [2, makeRows(PAGE_SIZE, 2 * PAGE_SIZE)],
    ])

    // When the window covers exactly those two pages
    purgeOutlierPages(cache, 1, 2)

    // Then both remain — no transient blank rows at the boundary
    expect(cache.has(1)).toBe(true)
    expect(cache.has(2)).toBe(true)
  })
})

describe("applyFetchedPages", () => {
  it("splits a pair response into its two cache slots", () => {
    // Given a pair plan and a two-page response
    const cache: PageCache = new Map()
    const plan: PageFetchPlan = {
      kind: "pair",
      lo: 0,
      hi: 2 * PAGE_SIZE,
      firstPage: 0,
      secondPage: 1,
    }

    // When applying the response
    applyFetchedPages(cache, plan, makeRows(2 * PAGE_SIZE))

    // Then each page slot holds its own PAGE_SIZE rows
    expect(cache.get(0)).toHaveLength(PAGE_SIZE)
    expect(cache.get(1)).toHaveLength(PAGE_SIZE)
    expect(cache.get(1)?.[0]).toEqual([PAGE_SIZE])
  })

  it("caches an empty second slot when only one page of rows returns", () => {
    // Given a pair plan whose response is a single short final page
    const cache: PageCache = new Map()
    const plan: PageFetchPlan = {
      kind: "pair",
      lo: 0,
      hi: 2 * PAGE_SIZE,
      firstPage: 3,
      secondPage: 4,
    }

    // When applying the response
    applyFetchedPages(cache, plan, makeRows(PAGE_SIZE))

    // Then the phantom second page is cached empty and still reads as not loaded
    expect(cache.get(3)).toHaveLength(PAGE_SIZE)
    expect(cache.get(4)).toHaveLength(0)
    expect(isPageEmpty(cache, 4)).toBe(true)
  })

  it("writes a single fetched page to its slot", () => {
    // Given a single-page plan
    const cache: PageCache = new Map()
    const plan: PageFetchPlan = {
      kind: "single",
      lo: 0,
      hi: PAGE_SIZE,
      page: 7,
    }

    // When applying the response
    applyFetchedPages(cache, plan, makeRows(PAGE_SIZE, 7 * PAGE_SIZE))

    // Then exactly that page is populated
    expect(cache.get(7)).toHaveLength(PAGE_SIZE)
    expect(cache.has(8)).toBe(false)
  })

  it("writes nothing for a none plan", () => {
    // Given a no-op plan
    const cache: PageCache = new Map()

    // When applying it
    applyFetchedPages(cache, { kind: "none" }, makeRows(PAGE_SIZE))

    // Then the cache is untouched
    expect(cache.size).toBe(0)
  })
})

describe("applyPageResponse", () => {
  const singlePlan: PageFetchPlan = {
    kind: "single",
    lo: 0,
    hi: PAGE_SIZE,
    page: 0,
  }
  const dqlResponse = (rows: ResultGridRow[]): QueryRawResult =>
    ({ dataset: rows }) as unknown as QueryRawResult

  it("applies a page when its generation still matches the current one", () => {
    // Given a fetch issued and resolved within the same generation
    const cache: PageCache = new Map()

    // When the response arrives
    const applied = applyPageResponse(
      cache,
      singlePlan,
      dqlResponse(makeRows(PAGE_SIZE)),
      3,
      3,
    )

    // Then it lands in the cache and signals a re-render
    expect(applied).toBe(true)
    expect(cache.get(0)).toHaveLength(PAGE_SIZE)
  })

  it("drops a stale response from a query the user has since superseded", () => {
    // Given a page fetched under generation 1 but the grid has moved to gen 2
    const cache: PageCache = new Map()

    // When the slow gen-1 response finally arrives
    const applied = applyPageResponse(
      cache,
      singlePlan,
      dqlResponse(makeRows(PAGE_SIZE)),
      1,
      2,
    )

    // Then it never touches the current result's cache
    expect(applied).toBe(false)
    expect(cache.size).toBe(0)
  })

  it("ignores a non-DQL response that carries no dataset", () => {
    // Given a current-generation response with no rows (e.g. a DDL/DML reply)
    const cache: PageCache = new Map()

    // When applying it
    const applied = applyPageResponse(
      cache,
      singlePlan,
      { ddl: true } as unknown as QueryRawResult,
      0,
      0,
    )

    // Then nothing is cached
    expect(applied).toBe(false)
    expect(cache.size).toBe(0)
  })
})
