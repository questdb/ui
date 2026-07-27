import { afterEach, describe, expect, it, vi } from "vitest"
import type { SingleQueryResult } from "../../../store/notebook"
import { saveCellSnapshot } from "../../../store/notebookResults"
import { persistCellSnapshot } from "./persistCellSnapshot"

vi.mock("../../../store/notebookResults", () => ({
  saveCellSnapshot: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../../../components/Toast", () => ({
  toast: { error: vi.fn() },
}))

const oversizedDql = (): SingleQueryResult => ({
  type: "dql",
  query: "select 1",
  columns: [{ name: "x", type: "STRING" }],
  dataset: Array.from({ length: 40 }, () => ["x".repeat(100_000)]),
  count: 40,
  timestamp: 1,
})

describe("persistCellSnapshot", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("caps oversized results in the saved payload without touching the input", async () => {
    // Given a snapshot whose result serializes beyond the notebook byte cap
    const results = [oversizedDql()]
    const rowCountBefore =
      results[0].type === "dql" ? results[0].dataset.length : 0

    // When it is persisted
    const saved = await persistCellSnapshot({
      bufferId: 1,
      cellId: "c1",
      results,
      savedAt: 123,
    })

    // Then the saved payload holds a truncated copy
    expect(saved).toBe(true)
    const [payload] = vi.mocked(saveCellSnapshot).mock.calls[0]
    const savedResult = payload.results[0]
    expect(savedResult.type).toBe("dql")
    if (savedResult.type === "dql") {
      expect(savedResult.truncated).toBe(true)
      expect(savedResult.dataset.length).toBeLessThan(rowCountBefore)
    }

    // And the input snapshot keeps its array identity and full rows
    expect(payload.results).not.toBe(results)
    expect(results[0].type === "dql" && results[0].dataset.length).toBe(
      rowCountBefore,
    )
    expect(results[0].type === "dql" && results[0].truncated).toBeUndefined()
  })

  it("passes results under the cap through unchanged", async () => {
    // Given a small result
    const small: SingleQueryResult = {
      type: "dql",
      query: "select 1",
      columns: [{ name: "x", type: "INT" }],
      dataset: [[1]],
      count: 1,
      timestamp: 1,
    }

    // When it is persisted
    await persistCellSnapshot({
      bufferId: 1,
      cellId: "c1",
      results: [small],
      savedAt: 123,
    })

    // Then the saved result is the same instance, not a truncated copy
    const [payload] = vi.mocked(saveCellSnapshot).mock.calls[0]
    expect(payload.results[0]).toBe(small)
  })
})
