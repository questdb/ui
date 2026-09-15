import { db } from "./db"
import type { NotebookVariable } from "./notebook"
import { GLOBAL_OPTIONS_OWNER } from "./notebookOptions"
import {
  changedVariableNames,
  redefinedVariableNames,
} from "../scenes/Editor/Notebook/variables/variableChanges"
import { listsAffectedByChange } from "../scenes/Editor/Notebook/variables/options/affectedLists"

export type NotebookGlobals = {
  id: string
  variables: NotebookVariable[]
  // Rows saved before revision tracking start at zero.
  revision?: number
}

const GLOBALS_ID = "globals"

export class GlobalsChangedError extends Error {
  constructor() {
    super(
      "Global variables changed. Call get_global_variables and retry with its revision.",
    )
    this.name = "GlobalsChangedError"
  }
}

export const getNotebookGlobals = async (): Promise<NotebookGlobals | null> =>
  (await db.notebook_globals.get(GLOBALS_ID)) ?? null

// The comparison and write share a transaction, including edits from the UI
// and other browser tabs. Network validation must finish before calling this.
export const replaceNotebookGlobals = (
  variables: NotebookVariable[],
  expectedRevision?: number,
  signal?: AbortSignal,
): Promise<number> =>
  db.transaction("rw", db.notebook_globals, db.notebook_options, async () => {
    const previous = await getNotebookGlobals()
    const revision = previous?.revision ?? 0
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError")
    if (expectedRevision !== undefined && revision !== expectedRevision) {
      throw new GlobalsChangedError()
    }
    const before = previous?.variables ?? []
    const changed = changedVariableNames(before, variables)
    const invalidated = new Set([
      ...redefinedVariableNames(before, variables),
      ...listsAffectedByChange(variables, changed, []).map((v) => v.name),
    ])
    await db.notebook_options.bulkDelete(
      [...invalidated].map((name) => [GLOBAL_OPTIONS_OWNER, name]),
    )
    const nextRevision = revision + 1
    await db.notebook_globals.put({
      id: GLOBALS_ID,
      variables,
      revision: nextRevision,
    })
    return nextRevision
  })

export const saveNotebookGlobals = async (
  variables: NotebookVariable[],
): Promise<void> => {
  await replaceNotebookGlobals(variables)
}
