import { db } from "../../../../../store/db"
import type { NotebookVariable } from "../../../../../store/notebook"
import { normalizeVariables } from "../normalizeVariables"

export const globalNameConflict = async (
  globals: NotebookVariable[],
  currentBufferId?: number,
): Promise<string | undefined> => {
  if (globals.length === 0) return undefined
  const buffers = await db.buffers.toArray()
  const localNames = new Set(
    buffers
      .filter((buffer) => buffer.id !== currentBufferId)
      .flatMap((buffer) =>
        normalizeVariables(buffer.notebookViewState?.settings?.variables).map(
          (variable) => variable.name.toLowerCase(),
        ),
      ),
  )
  return globals.find((variable) => localNames.has(variable.name.toLowerCase()))
    ?.name
}
