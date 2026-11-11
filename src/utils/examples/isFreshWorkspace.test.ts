import { describe, expect, it } from "vitest"
import type { Buffer } from "../../store/buffers"
import { isFreshWorkspace } from "./isFreshWorkspace"

const sql = (extra: Partial<Buffer> = {}) =>
  ({ id: 1, label: "SQL", value: "", position: 0, ...extra }) as Buffer

describe("isFreshWorkspace", () => {
  it("is true for the single empty SQL tab the store seeds", () => {
    expect(isFreshWorkspace([sql()])).toBe(true)
  })

  it("is false once the user has typed, added, closed or opened anything", () => {
    expect(isFreshWorkspace([sql({ value: "select 1" })])).toBe(false)
    expect(isFreshWorkspace([sql(), sql({ id: 2, label: "SQL 1" })])).toBe(
      false,
    )
    expect(isFreshWorkspace([sql({ archived: true })])).toBe(false)
    expect(isFreshWorkspace([sql({ notebookViewState: { cells: [] } })])).toBe(
      false,
    )
    expect(isFreshWorkspace([sql({ templateId: "fx" })])).toBe(false)
    expect(isFreshWorkspace([])).toBe(false)
  })
})
