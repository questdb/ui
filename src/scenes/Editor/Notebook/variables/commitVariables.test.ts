import "../../../../test/stubBrowserGlobals"
import { beforeEach, describe, expect, it } from "vitest"
import { db } from "../../../../store/db"
import { commitVariables } from "./commitVariables"

beforeEach(async () => {
  await db.buffers.clear()
  await db.notebook_options.clear()
})
const snapshot = {
  settings: { timeRange: { from: "now-1h", to: "now" } },
  options: {
    a: {
      options: [{ value: "2", label: "2" }],
      columns: [],
      truncated: false,
      warnings: [],
      fetchedAt: 1,
    },
  },
  errors: {},
  entries: [],
  report: [],
}

describe("commitVariables", () => {
  it("rolls back fetched values when saving settings fails", async () => {
    // Given
    const save = () => Promise.reject(new Error("storage failed"))
    // When
    const commit = commitVariables(
      "buffer:1",
      snapshot,
      save,
      new AbortController().signal,
    )
    // Then
    await expect(commit).rejects.toThrow("storage failed")
    expect(await db.notebook_options.count()).toBe(0)
  })

  it("commits settings and fetched values together", async () => {
    // Given
    await db.buffers.put({
      id: 1,
      label: "Notebook",
      value: "",
      position: 0,
      notebookViewState: { cells: [] },
    })
    // When
    await commitVariables(
      "buffer:1",
      snapshot,
      async () => {
        await db.buffers.update(1, {
          notebookViewState: { cells: [], settings: snapshot.settings },
        })
      },
      new AbortController().signal,
    )
    // Then
    expect((await db.buffers.get(1))?.notebookViewState?.settings).toEqual(
      snapshot.settings,
    )
    expect(
      (await db.notebook_options.get(["buffer:1", "a"]))?.options[0].value,
    ).toBe("2")
  })

  it("does not write after cancellation", async () => {
    // Given
    const controller = new AbortController()
    controller.abort()
    // When
    const commit = commitVariables(
      "buffer:1",
      snapshot,
      () => Promise.resolve(),
      controller.signal,
    )
    // Then
    await expect(commit).rejects.toMatchObject({ name: "AbortError" })
    expect(await db.notebook_options.count()).toBe(0)
  })
})
