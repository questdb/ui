import { describe, expect, it } from "vitest"
import { appendQueryTarget } from "./appendQueryTarget"
import type { MetricsViewState } from "../../store/buffers"
import type { NotebookViewState } from "../../store/notebook"

const notebookViewState = { cells: [] } as unknown as NotebookViewState
const metricsViewState = { metrics: [] } as unknown as MetricsViewState

describe("appendQueryTarget", () => {
  it("appends to the editor of an open SQL tab", () => {
    expect(appendQueryTarget({})).toBe("editor")
    expect(appendQueryTarget({ isTemporary: false })).toBe("editor")
  })

  it("opens a new SQL tab instead of writing into a previewed SQL tab", () => {
    expect(appendQueryTarget({ isTemporary: true })).toBe("new-sql-tab")
  })

  it("adds a cell to an open notebook", () => {
    expect(appendQueryTarget({ notebookViewState })).toBe("notebook-cell")
  })

  it("opens a new notebook instead of adding a cell to a previewed notebook", () => {
    expect(appendQueryTarget({ notebookViewState, isTemporary: true })).toBe(
      "new-notebook",
    )
  })

  it("opens a new notebook from a metrics tab, previewed or not", () => {
    expect(appendQueryTarget({ metricsViewState })).toBe("new-notebook")
    expect(appendQueryTarget({ metricsViewState, isTemporary: true })).toBe(
      "new-notebook",
    )
  })
})
