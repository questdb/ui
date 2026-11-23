import type { UserActionEvent } from "../../utils/notebooks/notebookAIBridge"
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
    case "user_changed_autorefresh_default":
      digest.autoRefreshDefaultTo = evt.value
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

export type UserActionDigestCapture = {
  digest: UserActionDigest
  finish: (sent: boolean) => void
}

const copyDigest = (digest: UserActionDigest): UserActionDigest => ({
  ...digest,
  added: new Set(digest.added),
  deleted: new Set(digest.deleted),
  edited: new Set(digest.edited),
  ran: new Map(digest.ran),
})

export const isEmptyDigest = (d: UserActionDigest): boolean =>
  d.added.size === 0 &&
  d.deleted.size === 0 &&
  d.edited.size === 0 &&
  d.ran.size === 0 &&
  d.layoutModeTo === undefined &&
  d.autoRefreshDefaultTo === undefined &&
  d.notebookStatusChange === undefined

export const createUserActionDigestState = () => {
  let pending = createEmptyDigest()
  let sinceCapture: UserActionDigest | undefined

  return {
    peek: (): UserActionDigest => pending,
    apply(event: UserActionEvent) {
      applyUserActionToDigest(pending, event)
      if (sinceCapture) applyUserActionToDigest(sinceCapture, event)
    },
    capture(): UserActionDigestCapture | undefined {
      if (isEmptyDigest(pending)) return undefined
      const suffix = createEmptyDigest()
      sinceCapture = suffix
      return {
        digest: copyDigest(pending),
        finish(sent) {
          // Only the current submission owns the capture. A stopped submission
          // can settle after its successor has already captured the digest.
          if (sinceCapture !== suffix) return
          if (sent) pending = suffix
          sinceCapture = undefined
        },
      }
    },
  }
}
