import { describe, expect, it } from "vitest"
import type { NotebookCell } from "../../../src/store/notebook"
import { getCellRunStatus } from "../../../src/utils/ai/runStatus"
import { stripCellResults } from "../../../src/scenes/Editor/Notebook/notebookUtils"

describe("lastRunError carry chain", () => {
  const errored = (id: string): NotebookCell => ({
    id,
    position: 0,
    value: "select boom",
    result: {
      results: [
        { type: "error", query: "select boom", error: "table does not exist" },
      ],
      activeResultIndex: 0,
      timestamp: 0,
    },
  })

  it("getCellRunStatus surfaces the carried error after a strip", () => {
    // Given an errored cell whose result blob was stripped
    const [stripped] = stripCellResults([errored("a")])

    // Then the agent-facing status still reports the error message
    expect(getCellRunStatus(stripped)).toEqual({
      status: "error",
      error: "table does not exist",
    })
  })
})
