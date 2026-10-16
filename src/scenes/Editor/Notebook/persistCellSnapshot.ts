import { toast } from "../../../components/Toast"
import {
  saveCellSnapshot,
  type NotebookResultSnapshot,
} from "../../../store/notebookResults"
import { capResultBytes, NOTEBOOK_BYTE_CAP } from "./notebookUtils"

// Stable id so a storage failure that repeats across many cells (e.g. the disk
// quota is exhausted) collapses into a single toast instead of flooding.
const SNAPSHOT_SAVE_ERROR_TOAST_ID = "notebook-snapshot-save-error"

// Caps and serialization must happen before opening a multi-table write
// transaction, so large result frames do not hold the editor buffers lock.
// A nested write may resolve before its ROOT transaction commits. Headless
// callers must catch root commit failures and retry metadata-only persistence.
//
// DELIBERATE — not a bug: a byte-capped save marks the
// copy `truncated` and keeps `count` at the server value, so a release/
// re-hydrate cycle serves the capped prefix behind the same "X of Y rows
// (truncated)" indicator as the fetch row cap; draw mode rejects truncated
// frames and refetches. Oversized rows can be afforded neither in memory
// forever (releasing off-screen results is the point of virtualization) nor
// in full on disk. The capped snapshot is the best-effort middle ground, and
// a re-run recovers the full set.
//
// Deliberately save-only: the cross-notebook recency prune runs where a NEW
// notebook can actually enter the table — notebook open, duplication, and the
// headless run commit — not on every frame a live chart persists.
export const prepareCellSnapshot = (
  snapshot: NotebookResultSnapshot,
): NotebookResultSnapshot => ({
  ...snapshot,
  results: snapshot.results.map((r) => capResultBytes(r, NOTEBOOK_BYTE_CAP)),
})

export const reportSnapshotSaveFailure = (error: unknown): false => {
  console.error("Failed to persist notebook cell result", error)
  toast.error(
    "Couldn't save this cell's result for offline restore. It may be lost on reload or your browser storage might be full.",
    { toastId: SNAPSHOT_SAVE_ERROR_TOAST_ID },
  )
  return false
}

export const persistPreparedCellSnapshot = (
  snapshot: NotebookResultSnapshot,
): Promise<boolean> =>
  saveCellSnapshot(snapshot).then(() => true, reportSnapshotSaveFailure)

export const persistCellSnapshot = (
  snapshot: NotebookResultSnapshot,
): Promise<boolean> =>
  persistPreparedCellSnapshot(prepareCellSnapshot(snapshot))
