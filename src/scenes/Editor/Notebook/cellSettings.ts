import type { NotebookCell } from "../../../store/notebook"

/** Cell fields a settings drawer saves together. */
export type CellSettingsPatch = Partial<
  Pick<
    NotebookCell,
    "chartConfig" | "formats" | "interactions" | "gridMode" | "highlightConfig"
  >
>

/**
 * The fields of `next` that are not the saved ones: what a save writes. A
 * drawer hands back every field it edits, the untouched ones as the very
 * objects it was given, so only the edited fields differ. A field present
 * with `undefined` is removed.
 */
export const changedSettings = <T extends object>(
  saved: T,
  next: T,
): Partial<T> => {
  const patch: Partial<T> = {}
  const keys = new Set([...Object.keys(saved), ...Object.keys(next)])
  for (const key of keys as Set<keyof T>) {
    if (next[key] !== saved[key]) patch[key] = next[key]
  }
  return patch
}

/**
 * The cell with the patch's fields set, or removed when `undefined`. The same
 * cell when the patch changes nothing, so a save without changes writes
 * nothing.
 */
export const applyCellSettings = (
  cell: NotebookCell,
  patch: CellSettingsPatch,
): NotebookCell => {
  const keys = (Object.keys(patch) as (keyof CellSettingsPatch)[]).filter(
    (key) =>
      patch[key] === undefined
        ? Object.hasOwn(cell, key)
        : patch[key] !== cell[key],
  )
  if (keys.length === 0) return cell
  const next: NotebookCell = { ...cell }
  for (const key of keys) {
    const value = patch[key]
    if (value === undefined) delete next[key]
    else (next as Record<string, unknown>)[key] = value
  }
  return next
}
