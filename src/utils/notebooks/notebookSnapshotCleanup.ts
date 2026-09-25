import type { NotebookTransitionResult } from "./notebookController"
import { NotebookToolError } from "./notebookToolError"

type SnapshotDrops = Pick<
  NotebookTransitionResult<unknown>,
  "cleanup" | "deleteSnapshots"
>

// Cells whose snapshot rows a transition drops: deleted cells, and cells whose
// result it discarded.
export const droppedSnapshotCellIds = (out: SnapshotDrops): string[] => [
  ...(out.cleanup?.cellIds ?? []),
  ...(out.deleteSnapshots?.cellIds ?? []),
]

// The document that stops referencing a snapshot must be durable before the
// snapshot goes. A failed write keeps both, so a reload restores the previous
// cell together with its result.
export const dropSnapshotsAfterPersist = (
  persisted: Promise<void>,
  cellIds: string[],
  drop: (cellId: string) => Promise<void>,
): Promise<void> =>
  persisted.then(
    () => {
      for (const cellId of cellIds) void drop(cellId)
    },
    () => undefined,
  )

export const persistFailure = (error: unknown): NotebookToolError =>
  new NotebookToolError(
    "persist_failed",
    `The change is applied in the open notebook but was not saved: ${
      error instanceof Error ? error.message : String(error)
    }`,
  )
