import "../../../../../test/stubBrowserGlobals"
import { beforeEach, describe, expect, it } from "vitest"
import { db } from "../../../../../store/db"
import { globalNameConflict } from "./globalNameConflict"

beforeEach(async () => {
  await db.buffers.clear()
})

describe("globalNameConflict", () => {
  it("excludes the current notebook because the dialog validates its drafts", async () => {
    // Given
    await db.buffers.put({
      id: 1,
      label: "Notebook",
      position: 0,
      value: "",
      notebookViewState: {
        cells: [],
        settings: {
          variables: [{ name: "a", kind: "expression", value: "5" }],
        },
      },
    })
    const globals = [{ name: "A", kind: "expression" as const, value: "5" }]

    // When
    const current = await globalNameConflict(globals, 1)
    const other = await globalNameConflict(globals, 2)

    // Then
    expect(current).toBeUndefined()
    expect(other).toBe("A")
  })
})
