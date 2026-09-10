import { describe, expect, it, vi } from "vitest"
import {
  dropSnapshotsAfterPersist,
  droppedSnapshotCellIds,
  persistFailure,
} from "./notebookSnapshotCleanup"
import { NotebookToolError } from "./notebookToolError"

describe("dropSnapshotsAfterPersist", () => {
  it("drops the snapshots of deleted and discarded cells once the document write lands", async () => {
    // Given a transition that deleted one cell and discarded another's result
    const cellIds = droppedSnapshotCellIds({
      cleanup: { cellIds: ["deleted"] },
      deleteSnapshots: { cellIds: ["discarded"] },
    })
    const drop = vi.fn((_cellId: string) => Promise.resolve())

    // When the document write succeeds
    await dropSnapshotsAfterPersist(Promise.resolve(), cellIds, drop)

    // Then both snapshots go
    expect(drop.mock.calls.map(([cellId]) => cellId)).toEqual([
      "deleted",
      "discarded",
    ])
  })

  it("keeps every snapshot when the document write fails", async () => {
    // Given a write that fails, as a full local storage does
    const drop = vi.fn((_cellId: string) => Promise.resolve())

    // When the cleanup waits on it
    await dropSnapshotsAfterPersist(
      Promise.reject(new Error("QuotaExceededError")),
      ["deleted"],
      drop,
    )

    // Then no snapshot is dropped and the failure does not escape
    expect(drop).not.toHaveBeenCalled()
  })
})

describe("persistFailure", () => {
  it("maps a failed write to the persist_failed tool error with its cause", () => {
    // When a write failure is mapped for the agent
    const error = persistFailure(new Error("QuotaExceededError"))

    // Then the agent gets the typed code and the cause
    expect(error).toBeInstanceOf(NotebookToolError)
    expect(error.code).toBe("persist_failed")
    expect(error.message).toContain("QuotaExceededError")
  })
})
