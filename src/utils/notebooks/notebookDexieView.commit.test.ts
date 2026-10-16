import "../../test/stubBrowserGlobals"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { db } from "../../store/db"
import { eventBus } from "../../modules/EventBus"
import { EventType } from "../../modules/EventBus/types"
import {
  commitView,
  partsOf,
  __resetNotebookDexieViewForTests,
} from "./notebookDexieView"

beforeEach(async () => {
  await db.buffers.clear()
  await db.buffers.put({
    id: 77,
    label: "Notebook",
    value: "",
    position: 0,
    notebookViewState: { cells: [{ id: "c", position: 0, value: "select 1" }] },
  })
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
})
afterEach(() => {
  __resetNotebookDexieViewForTests()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe("notebook root-commit search publication", () => {
  it.each([false, true])(
    "publishes only accepted root commits (abort=%s)",
    async (abort) => {
      const publish = vi.spyOn(eventBus, "publish")
      const parts = partsOf({
        cells: [{ id: "c", position: 0, value: "select 2" }],
      })
      const sentinel = new Error("Roll back outer transaction")
      const transaction = db.transaction(
        "rw",
        db.buffers,
        db.notebook_results,
        async () => {
          expect(await commitView(77, parts)).toBe("committed")
          expect(publish).not.toHaveBeenCalled()
          if (abort) throw sentinel
        },
      )
      if (abort) await expect(transaction).rejects.toBe(sentinel)
      else await transaction
      expect(publish).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(300)
      const searchUpdates = publish.mock.calls.filter(
        ([event]) => event === EventType.BUFFERS_UPDATED,
      )
      expect(searchUpdates).toHaveLength(abort ? 0 : 1)
      if (!abort)
        expect(searchUpdates[0][1]).toMatchObject({
          bufferId: 77,
          contentUpdate: true,
        })
    },
  )
})
