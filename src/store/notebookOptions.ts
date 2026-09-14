import { db } from "./db"
import type { VariableOption } from "./notebook"

export type StoredVariableOptions = {
  owner: string
  name: string
  options: VariableOption[]
  fetchedAt: number
}

export const GLOBAL_OPTIONS_OWNER = "global"

export const notebookOptionsOwner = (bufferId: number): string =>
  `buffer:${bufferId}`

export const loadStoredOptions = (
  owner: string,
): Promise<StoredVariableOptions[]> =>
  db.notebook_options.where("owner").equals(owner).toArray()

export const saveStoredOptions = async (
  row: StoredVariableOptions,
): Promise<void> => {
  await db.notebook_options.put(row)
}

export const deleteStoredOptions = async (
  owner: string,
  names: string[],
): Promise<void> => {
  if (names.length === 0) return
  await db.notebook_options.bulkDelete(names.map((name) => [owner, name]))
}

export const deleteAllStoredOptions = async (owner: string): Promise<void> => {
  await db.notebook_options.where("owner").equals(owner).delete()
}

export const copyStoredOptions = (
  fromOwner: string,
  toOwner: string,
): Promise<void> =>
  db.transaction("rw", db.notebook_options, async () => {
    const rows = await loadStoredOptions(fromOwner)
    await db.notebook_options.bulkPut(
      rows.map((row) => ({ ...row, owner: toOwner })),
    )
  })
