import type { UserActionEvent } from "../../utils/notebookAIBridge"
import type { UserActionDigest } from "./types"

export const createEmptyDigest = (): UserActionDigest => ({
  added: new Set(),
  deleted: new Set(),
  edited: new Set(),
  ran: new Map(),
})

// Coalesces user-action events into the digest. Notes:
// - delete after add in same digest cancels both (add wins → erased).
// - edit on an added cell folds into the creation (no-op).
// - move/duplicate/cell-mode/grid-layout aren't tracked here; they ride on the snapshot.
export const applyUserActionToDigest = (
  digest: UserActionDigest,
  evt: UserActionEvent,
): UserActionDigest => {
  switch (evt.kind) {
    case "user_added_cell":
      digest.added.add(evt.cellId)
      return digest
    case "user_deleted_cell":
      if (digest.added.has(evt.cellId)) {
        digest.added.delete(evt.cellId)
      } else {
        digest.deleted.add(evt.cellId)
      }
      digest.edited.delete(evt.cellId)
      digest.ran.delete(evt.cellId)
      return digest
    case "user_updated_cell":
      if (!digest.added.has(evt.cellId)) {
        digest.edited.add(evt.cellId)
      }
      return digest
    case "user_ran_cell":
      digest.ran.set(evt.cellId, evt.status)
      return digest
    case "user_changed_layout_mode":
      digest.layoutModeTo = evt.mode
      return digest
    case "user_archived_notebook":
      digest.notebookStatusChange = "archived"
      return digest
    case "user_deleted_notebook":
      digest.notebookStatusChange = "deleted"
      return digest
    default:
      return digest
  }
}

export const isEmptyDigest = (d: UserActionDigest): boolean =>
  d.added.size === 0 &&
  d.deleted.size === 0 &&
  d.edited.size === 0 &&
  d.ran.size === 0 &&
  d.layoutModeTo === undefined &&
  d.notebookStatusChange === undefined
