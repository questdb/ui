import { db } from "./db"
import type { NotebookVariable } from "./notebook"

export type NotebookGlobals = {
  id: string
  variables: NotebookVariable[]
}

const GLOBALS_ID = "globals"

export const getNotebookGlobals = async (): Promise<NotebookGlobals | null> =>
  (await db.notebook_globals.get(GLOBALS_ID)) ?? null

export const saveNotebookGlobals = async (
  variables: NotebookVariable[],
): Promise<void> => {
  await db.notebook_globals.put({ id: GLOBALS_ID, variables })
}
