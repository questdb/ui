import { describe, it, expect } from "vitest"
import { planPageFetch, splitPagePair } from "./pageFetchPlan"
import { PAGE_SIZE } from "./nextPageWindow"

// isEmptyPage returns true for any page that is NOT loaded.
const loadedExcept =
  (...loadedPages: number[]) =>
  (page: number): boolean =>
    !loadedPages.includes(page)

const makeRows = (count: number): number[][] =>
  Array.from({ length: count }, (_, i) => [i])

describe("planPageFetch", () => {
  it("fetches both pages when an uncached adjacent pair is requested", () => {
    // Given two uncached, adjacent pages
    const isEmptyPage = loadedExcept()

    // When planning the fetch
    const plan = planPageFetch(0, 1, isEmptyPage)

    // Then both are fetched in a single range, split into two cache slots
    expect(plan).toEqual({
      kind: "pair",
      lo: 0,
      hi: 2 * PAGE_SIZE,
      firstPage: 0,
      secondPage: 1,
    })
  })

  it("fetches only the first page when its neighbour is already cached", () => {
    // Given page 3 is cached and page 2 is not
    const isEmptyPage = loadedExcept(3)

    // When planning the fetch for the pair (2, 3)
    const plan = planPageFetch(2, 3, isEmptyPage)

    // Then only page 2 is fetched
    expect(plan).toEqual({
      kind: "single",
      lo: 2 * PAGE_SIZE,
      hi: 3 * PAGE_SIZE,
      page: 2,
    })
  })

  it("fetches only the second page when the first is already cached", () => {
    // Given page 4 is cached and page 5 is not
    const isEmptyPage = loadedExcept(4)

    // When planning the fetch for the pair (4, 5)
    const plan = planPageFetch(4, 5, isEmptyPage)

    // Then only page 5 is fetched
    expect(plan).toEqual({
      kind: "single",
      lo: 5 * PAGE_SIZE,
      hi: 6 * PAGE_SIZE,
      page: 5,
    })
  })

  it("fetches a single page when both indices point to the same uncached page", () => {
    // Given a single uncached page requested as a degenerate pair
    const isEmptyPage = loadedExcept()

    // When planning the fetch for (7, 7)
    const plan = planPageFetch(7, 7, isEmptyPage)

    // Then exactly that page is fetched, not two
    expect(plan).toEqual({
      kind: "single",
      lo: 7 * PAGE_SIZE,
      hi: 8 * PAGE_SIZE,
      page: 7,
    })
  })

  it("requests nothing when both requested pages are already cached", () => {
    // Given both pages are cached
    const isEmptyPage = loadedExcept(0, 1)

    // When planning the fetch
    const plan = planPageFetch(0, 1, isEmptyPage)

    // Then nothing is fetched
    expect(plan).toEqual({ kind: "none" })
  })

  it("requests nothing when the same cached page is requested twice", () => {
    // Given a cached page requested as a degenerate pair
    const isEmptyPage = loadedExcept(0)

    // When planning the fetch for (0, 0)
    const plan = planPageFetch(0, 0, isEmptyPage)

    // Then nothing is fetched
    expect(plan).toEqual({ kind: "none" })
  })
})

describe("splitPagePair", () => {
  it("splits a full two-page response down the middle", () => {
    // Given a response holding exactly two pages of rows
    const dataset = makeRows(2 * PAGE_SIZE)

    // When splitting it
    const { first, second } = splitPagePair(dataset)

    // Then each page gets PAGE_SIZE rows, in order
    expect(first).toHaveLength(PAGE_SIZE)
    expect(second).toHaveLength(PAGE_SIZE)
    expect(first[0]).toEqual([0])
    expect(second[0]).toEqual([PAGE_SIZE])
  })

  it("keeps a short final page in the second slot", () => {
    // Given a response shorter than two full pages
    const dataset = makeRows(PAGE_SIZE + 500)

    // When splitting it
    const { first, second } = splitPagePair(dataset)

    // Then the remainder lands in the second slot
    expect(first).toHaveLength(PAGE_SIZE)
    expect(second).toHaveLength(500)
  })

  it("leaves the second slot empty when only one page of rows returns", () => {
    // Given a response of exactly one page
    const dataset = makeRows(PAGE_SIZE)

    // When splitting it
    const { first, second } = splitPagePair(dataset)

    // Then the second slot is empty (an unreachable phantom page)
    expect(first).toHaveLength(PAGE_SIZE)
    expect(second).toHaveLength(0)
  })

  it("does not mutate the original response", () => {
    // Given a response array
    const dataset = makeRows(PAGE_SIZE + 10)

    // When splitting it
    splitPagePair(dataset)

    // Then the source array is untouched
    expect(dataset).toHaveLength(PAGE_SIZE + 10)
  })
})
