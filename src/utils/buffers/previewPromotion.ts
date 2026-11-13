import type { Buffer } from "../../store/buffers"

// `activeBuffer` is a cached snapshot. When an update reopens the tab that is
// being previewed (isTemporary cleared and archived: false), the snapshot must
// follow, or the preview UI (PreviewBar, read-only editor) outlives the
// preview. Returns the refreshed snapshot, or undefined when the update does
// not promote the active preview.
export const promoteActivePreview = (
  active: Buffer,
  id: number,
  payload: Partial<Buffer>,
): Buffer | undefined => {
  if (active.id !== id || !active.isTemporary) return undefined
  if (payload.isTemporary !== false || payload.archived !== false) {
    return undefined
  }
  return { ...active, ...payload, isTemporary: false }
}
