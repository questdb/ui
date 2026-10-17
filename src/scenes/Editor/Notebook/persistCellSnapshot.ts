import { toast } from "../../../components/Toast"
import {
  saveCellSnapshot,
  type NotebookResultSnapshot,
} from "../../../store/notebookResults"
import { capResultBytes, NOTEBOOK_BYTE_CAP } from "./notebookUtils"

// Stable id so a storage failure that repeats across many cells (e.g. the disk
// quota is exhausted) collapses into a single toast instead of flooding.
const SNAPSHOT_SAVE_ERROR_TOAST_ID = "notebook-snapshot-save-error"

// Cap and serialize before opening a multi-table write transaction. This keeps
// CPU work outside the buffers lock; atomic headless commits still hold that
// lock during the IndexedDB snapshot write, so metadata and snapshot agree.
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

// A byte-capped save keeps the server count and marks its copied prefix as
// truncated; draw mode refetches truncated frames. Re-running restores the
// full frame. Save-only: cross-notebook pruning belongs to notebook open,
// duplication and headless commit, not to every chart frame.
// Returns true when saved and false on storage failure (also reported once
// via toast). A nested write can resolve before its ROOT transaction commits;
// headless callers must catch root failures and retry metadata-only storage.
export const persistCellSnapshot = (
  snapshot: NotebookResultSnapshot,
): Promise<boolean> =>
  persistPreparedCellSnapshot(prepareCellSnapshot(snapshot))
