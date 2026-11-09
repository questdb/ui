// @vitest-environment jsdom
import React, { useEffect } from "react"
import { act, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "../../test/component"
import { usePagedDataSource } from "./usePagedDataSource"
import {
  LOAD_DEBOUNCE_MS,
  type PaginationFn,
  type SeedResult,
} from "./pagedSource"
import type { QueryRawResult } from "../../utils/questdb"

vi.mock("../../modules/ConsoleEventTracker", () => ({ trackEvent: vi.fn() }))
const seed = (query: string, multiplier = 1): SeedResult => ({
  query,
  columns: [{ name: "x", type: "LONG" }],
  count: 5000,
  dataset: Array.from({ length: 1000 }, (_, i) => [(i + 1) * multiplier]),
})
const Harness = ({
  result,
  first,
  last,
  paginationFn,
}: {
  result: SeedResult
  first: number
  last: number
  paginationFn: PaginationFn
}) => {
  const source = usePagedDataSource(paginationFn)
  useEffect(() => source.setResult(result), [result, source.setResult])
  useEffect(() => {
    source.dataSource.onVisibleRowsChange?.({
      firstIndex: first,
      lastIndex: last,
      direction: 1,
    })
  }, [first, last, result, source.dataSource.onVisibleRowsChange])
  return (
    <output aria-label="Rows">
      {JSON.stringify([
        source.dataSource.getRow(first),
        source.dataSource.getRow(last),
      ])}
    </output>
  )
}
const pendingPages = () => {
  const calls: {
    sql: string
    lo: number
    hi: number
    reply: (multiplier?: number) => void
  }[] = []
  const paginationFn: PaginationFn = (sql, lo, hi, renderRows) => {
    calls.push({
      sql,
      lo,
      hi,
      reply: (multiplier = 1) =>
        renderRows({
          dataset: Array.from({ length: hi - lo + 1 }, (_, i) => [
            (lo + i) * multiplier,
          ]),
        } as QueryRawResult),
    })
  }
  return { calls, paginationFn }
}
const advance = () =>
  act(() => {
    vi.advanceTimersByTime(LOAD_DEBOUNCE_MS)
  })
afterEach(() => {
  vi.useRealTimers()
})

describe("paged result React integration", () => {
  it("renders both sides of an adjacent-page response at their absolute rows", () => {
    // Given
    vi.useFakeTimers()
    const pages = pendingPages()
    render(
      <Harness
        result={seed("A")}
        first={2999}
        last={3000}
        paginationFn={pages.paginationFn}
      />,
    )
    advance()
    expect(pages.calls).toHaveLength(1)
    expect(pages.calls[0]).toMatchObject({ sql: "A", lo: 2001, hi: 4000 })
    // When
    act(() => pages.calls[0].reply())
    // Then
    expect(screen.getByLabelText("Rows")).toHaveTextContent("[[3000],[3001]]")
  })

  it.each([true, false])(
    "keeps query B when the stale A response arrives first=%s",
    (oldFirst) => {
      // Given
      vi.useFakeTimers()
      const pages = pendingPages()
      const view = render(
        <Harness
          result={seed("A")}
          first={2500}
          last={2501}
          paginationFn={pages.paginationFn}
        />,
      )
      advance()
      // When
      view.rerender(
        <Harness
          result={seed("B", 1000)}
          first={2500}
          last={2501}
          paginationFn={pages.paginationFn}
        />,
      )
      advance()
      expect(pages.calls.map(({ sql }) => sql)).toEqual(["A", "B"])
      if (oldFirst) {
        act(() => pages.calls[0].reply())
        expect(screen.getByLabelText("Rows")).toHaveTextContent("[null,null]")
        act(() => pages.calls[1].reply(1000))
      } else {
        act(() => pages.calls[1].reply(1000))
        expect(screen.getByLabelText("Rows")).toHaveTextContent(
          "[[2501000],[2502000]]",
        )
        act(() => pages.calls[0].reply())
      }
      // Then
      expect(screen.getByLabelText("Rows")).toHaveTextContent(
        "[[2501000],[2502000]]",
      )
    },
  )
})
