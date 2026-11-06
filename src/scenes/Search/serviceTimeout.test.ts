import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock only findMatches; keep the real error classes so `instanceof` checks in
// service.ts line up with what these tests throw.
vi.mock("../../utils/textSearch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../utils/textSearch")>()
  return { ...actual, findMatches: vi.fn() }
})

import {
  findMatches,
  SearchTimeoutError,
  SearchCancelledError,
  type TextMatch,
} from "../../utils/textSearch"
import { SearchService } from "./service"
import type { Buffer } from "../../store/buffers"
import type { NotebookCell, NotebookViewState } from "../../store/notebook"

const mockedFindMatches = vi.mocked(findMatches)

const cell = (overrides: Partial<NotebookCell>): NotebookCell => ({
  id: "cell-1",
  position: 0,
  value: "",
  ...overrides,
})

const notebookBuffer = (cells: NotebookCell[]): Buffer => ({
  id: 1,
  label: "Notebook",
  value: "",
  position: 0,
  notebookViewState: { cells } as NotebookViewState,
})

const textMatch = (text: string): TextMatch => ({
  startOffset: 0,
  endOffset: text.length,
  lineNumber: 1,
  column: 1,
  endLineNumber: 1,
  endColumn: text.length + 1,
  text,
  previewText: text,
  matchStartInPreview: 0,
  matchEndInPreview: text.length,
})

const run = (buffer: Buffer, query: string, signal: AbortSignal) =>
  SearchService.searchInSingleBuffer(buffer, query, {}, signal, "t", 100)

describe("searchInNotebookCells — timeout & cancellation", () => {
  beforeEach(() => {
    mockedFindMatches.mockReset()
  })

  it("re-throws accumulated partial matches when a cell search times out", async () => {
    // Given a notebook where the first cell yields a match and the second times out
    const buffer = notebookBuffer([
      cell({ id: "c1", value: "price" }),
      cell({ id: "c2", value: "price" }),
    ])
    let call = 0
    mockedFindMatches.mockImplementation(() => {
      call += 1
      if (call === 1) return Promise.resolve([]) // title (buffer label)
      if (call === 2) return Promise.resolve([textMatch("price")]) // c1 value
      return Promise.reject(
        new SearchTimeoutError("timed out", [textMatch("price")]),
      ) // c2 value
    })

    // When searching
    let thrown: unknown
    try {
      await run(buffer, "price", new AbortController().signal)
    } catch (e) {
      thrown = e
    }

    // Then a timeout error carries the matches gathered before the timeout
    expect(thrown).toBeInstanceOf(SearchTimeoutError)
    const partial = (thrown as SearchTimeoutError).partialSearchMatches ?? []
    expect(partial).toHaveLength(2)
    expect(partial.every((m) => m.isNotebookMatch)).toBe(true)
  })

  it("cancels mid-scan when the signal aborts between cells", async () => {
    // Given a notebook being scanned cell by cell
    const buffer = notebookBuffer([
      cell({ id: "c1", value: "price" }),
      cell({ id: "c2", value: "price" }),
      cell({ id: "c3", value: "price" }),
    ])
    const controller = new AbortController()
    let call = 0
    mockedFindMatches.mockImplementation(() => {
      call += 1
      if (call === 2) controller.abort() // abort during c1's content search
      return Promise.resolve([])
    })

    // When the signal aborts mid-flight
    // Then the cell loop stops with a cancellation error
    await expect(
      run(buffer, "price", controller.signal),
    ).rejects.toBeInstanceOf(SearchCancelledError)
  })
})
