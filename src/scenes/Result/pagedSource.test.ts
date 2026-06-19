import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { QueryRawResult } from "../../utils"
import type { ResultGridRow } from "../../components/ResultGrid"
import { PAGE_SIZE } from "./nextPageWindow"
import {
  createPagedSource,
  LOAD_DEBOUNCE_MS,
  type PaginationFn,
  type SeedResult,
} from "./pagedSource"

const DOWN = 1

const makeRows = (count: number, base = 0): ResultGridRow[] =>
  Array.from({ length: count }, (_, i) => [base + i])

const dqlResponse = (rows: ResultGridRow[]): QueryRawResult =>
  ({ dataset: rows }) as unknown as QueryRawResult

const seed = (count: number, query = "select x"): SeedResult => ({
  columns: [{ name: "x", type: "INT" }],
  dataset: makeRows(PAGE_SIZE),
  count,
  query,
})

// A paginationFn that records its calls and lets the test resolve responses
// later, simulating a server round-trip.
const deferredPagination = () => {
  const calls: {
    sql: string
    lo: number
    hi: number
    respond: (rows: ResultGridRow[]) => void
  }[] = []
  const fn: PaginationFn = (sql, lo, hi, rendererFn) => {
    calls.push({
      sql,
      lo,
      hi,
      respond: (rows) => rendererFn(dqlResponse(rows)),
    })
  }
  return { fn, calls }
}

describe("createPagedSource", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("coalesces rapid scroll events into a single fetch per debounce window", () => {
    // Given a paged source over a multi-page result
    const { fn, calls } = deferredPagination()
    const source = createPagedSource(fn, vi.fn())
    source.setResult(seed(5000))

    // When several scroll updates fire within one debounce window
    source.onVisibleRowsChange({
      firstIndex: 600,
      lastIndex: 700,
      direction: DOWN,
    })
    source.onVisibleRowsChange({
      firstIndex: 1600,
      lastIndex: 1700,
      direction: DOWN,
    })
    source.onVisibleRowsChange({
      firstIndex: 2600,
      lastIndex: 2700,
      direction: DOWN,
    })
    vi.advanceTimersByTime(LOAD_DEBOUNCE_MS)

    // Then only the last window is fetched, exactly once
    expect(calls).toHaveLength(1)
  })

  it("never fires a fetch scheduled before setResult against the new query", () => {
    // Given query A scrolled deep enough to schedule a page fetch
    const { fn, calls } = deferredPagination()
    const source = createPagedSource(fn, vi.fn())
    source.setResult(seed(5000, "select a"))
    source.onVisibleRowsChange({
      firstIndex: 2600,
      lastIndex: 2700,
      direction: DOWN,
    })

    // When query B supersedes A before the debounce elapses
    source.setResult(seed(5000, "select b"))
    vi.advanceTimersByTime(LOAD_DEBOUNCE_MS)

    // Then A's pending fetch never fires
    expect(calls).toHaveLength(0)
  })

  it("uses the current query's SQL for a fetch scheduled after setResult", () => {
    // Given the current query is B
    const { fn, calls } = deferredPagination()
    const source = createPagedSource(fn, vi.fn())
    source.setResult(seed(5000, "select b"))

    // When a scroll dispatches a page fetch
    source.onVisibleRowsChange({
      firstIndex: 2600,
      lastIndex: 2700,
      direction: DOWN,
    })
    vi.advanceTimersByTime(LOAD_DEBOUNCE_MS)

    // Then it fetches against B's SQL
    expect(calls).toHaveLength(1)
    expect(calls[0].sql).toBe("select b")
  })

  it("applies a current-generation page and exposes its rows at the absolute index", () => {
    // Given a deep page fetched within the current generation
    const { fn, calls } = deferredPagination()
    const onChange = vi.fn()
    const source = createPagedSource(fn, onChange)
    source.setResult(seed(5000))
    onChange.mockClear()

    source.onVisibleRowsChange({
      firstIndex: 2500,
      lastIndex: 2520,
      direction: DOWN,
    })
    vi.advanceTimersByTime(LOAD_DEBOUNCE_MS)

    // The page-2 fetch uses QuestDB's 1-based limit (lo = 2*PAGE_SIZE + 1)
    expect(calls[0].lo).toBe(2 * PAGE_SIZE + 1)
    expect(calls[0].hi).toBe(3 * PAGE_SIZE)

    // When page 2's rows (absolute-valued) come back
    calls[0].respond(makeRows(PAGE_SIZE, 2 * PAGE_SIZE))

    // Then the row reads back at its absolute index and a re-render is signalled
    expect(onChange).toHaveBeenCalled()
    expect(source.getRow(2500)).toEqual([2500])
  })

  it("drops a slow response from a query the user has since superseded", () => {
    // Given a page fetched under query A, still in flight
    const { fn, calls } = deferredPagination()
    const onChange = vi.fn()
    const source = createPagedSource(fn, onChange)
    source.setResult(seed(5000, "select a"))
    source.onVisibleRowsChange({
      firstIndex: 2500,
      lastIndex: 2520,
      direction: DOWN,
    })
    vi.advanceTimersByTime(LOAD_DEBOUNCE_MS)
    expect(calls).toHaveLength(1)

    // When query B supersedes A, then A's slow response finally lands
    source.setResult(seed(5000, "select b"))
    onChange.mockClear()
    calls[0].respond(makeRows(PAGE_SIZE, 2 * PAGE_SIZE))

    // Then the stale page is dropped: no re-render, B's deep page stays unloaded
    expect(onChange).not.toHaveBeenCalled()
    expect(source.getRow(2500)).toBeUndefined()
  })

  it("clears the pending fetch timer on dispose", () => {
    // Given a scheduled but not-yet-fired page fetch
    const { fn, calls } = deferredPagination()
    const source = createPagedSource(fn, vi.fn())
    source.setResult(seed(5000))
    source.onVisibleRowsChange({
      firstIndex: 2600,
      lastIndex: 2700,
      direction: DOWN,
    })

    // When the source is disposed before the debounce elapses
    source.dispose()
    vi.advanceTimersByTime(LOAD_DEBOUNCE_MS)

    // Then the fetch never fires
    expect(calls).toHaveLength(0)
  })

  it("exposes the seed page rows for markdown export of the current page", () => {
    // Given a freshly seeded result (current page is page 0)
    const source = createPagedSource(vi.fn(), vi.fn())
    source.setResult(seed(5000))

    // When reading the current page
    const rows = source.getCurrentPageRows()

    // Then it returns the seed page in order
    expect(rows).toHaveLength(PAGE_SIZE)
    expect(rows[0]).toEqual([0])
  })

  it("reports no fetch and undefined rows before any result is set", () => {
    // Given a source with no result yet
    const { fn, calls } = deferredPagination()
    const source = createPagedSource(fn, vi.fn())

    // Then nothing is loaded and the empty meta is exposed
    expect(source.getRow(0)).toBeUndefined()
    expect(source.getCurrentPageRows()).toEqual([])
    expect(source.getMeta().rowCount).toBe(0)
    expect(calls).toHaveLength(0)
  })
})
