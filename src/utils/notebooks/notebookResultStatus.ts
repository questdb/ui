import type { CellResultStatusReader } from "../../scenes/Editor/Notebook/notebookUtils"
import { loadSnapshotCellIds } from "../../store/notebookResults"

// A passive notebook view persists only the run marker; the result payload
// lives in notebook_results. Its per-buffer keys tell "exists" from "missing"
// without loading payloads. The index is optional: when the read fails the
// status degrades to "failed" and the caller carries on — the primary
// document stays authoritative.
export const loadPassiveResultStatusReader = async (
  bufferId: number,
): Promise<CellResultStatusReader> => {
  try {
    const snapshotCellIds = new Set(await loadSnapshotCellIds(bufferId))
    return (cellId) => (snapshotCellIds.has(cellId) ? "unrequested" : "missing")
  } catch (error) {
    console.warn(
      `notebook ${bufferId}: result snapshot index unavailable`,
      error,
    )
    return () => "failed"
  }
}
