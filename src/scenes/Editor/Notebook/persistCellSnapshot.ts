import { toast } from "../../../components/Toast"
import {
  pruneToRecentNotebooks,
  saveCellSnapshot,
  type NotebookResultSnapshot,
} from "../../../store/notebookResults"

// Stable id so a storage failure that repeats across many cells (e.g. the disk
// quota is exhausted) collapses into a single toast instead of flooding.
const SNAPSHOT_SAVE_ERROR_TOAST_ID = "notebook-snapshot-save-error"

export const persistCellSnapshot = (snapshot: NotebookResultSnapshot): void => {
  saveCellSnapshot(snapshot)
    .then(() => pruneToRecentNotebooks())
    .catch((error) => {
      console.error("Failed to persist notebook cell result", error)
      toast.error(
        "Couldn't save this cell's result for offline restore. It may be lost on reload or your browser storage might be full.",
        { toastId: SNAPSHOT_SAVE_ERROR_TOAST_ID },
      )
    })
}
