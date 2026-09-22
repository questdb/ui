import { db } from "../../../../../store/db"
import type { NotebookVariable } from "../../../../../store/notebook"
import {
  GLOBAL_OPTIONS_OWNER,
  loadStoredOptions,
  notebookOptionsOwner,
} from "../../../../../store/notebookOptions"
import { normalizeVariables } from "../normalizeVariables"
import { otherNotebooks, referencedNamesIn } from "./globalReferences"

export const copyGlobalsToLocals = (
  globals: NotebookVariable[],
  currentBufferId?: number,
): Promise<void> =>
  db.transaction("rw", db.buffers, db.notebook_options, async () => {
    if (globals.length === 0) return
    const names = globals.map((variable) => variable.name)
    const globalOptions = await loadStoredOptions(GLOBAL_OPTIONS_OWNER)
    for (const buffer of await otherNotebooks(currentBufferId)) {
      const { id, notebookViewState } = buffer
      const locals = normalizeVariables(notebookViewState.settings?.variables)
      const localNames = new Set(locals.map((v) => v.name.toLowerCase()))
      const referenced = new Set(referencedNamesIn(notebookViewState, names))
      const copied = globals.filter(
        (variable) =>
          referenced.has(variable.name) &&
          !localNames.has(variable.name.toLowerCase()),
      )
      if (copied.length === 0) continue
      await db.buffers.update(id, {
        notebookViewState: {
          ...notebookViewState,
          settings: {
            ...notebookViewState.settings,
            variables: [...copied, ...locals],
          },
        },
      })
      const copiedNames = new Set(copied.map((variable) => variable.name))
      await db.notebook_options.bulkPut(
        globalOptions
          .filter((row) => copiedNames.has(row.name))
          .map((row) => ({ ...row, owner: notebookOptionsOwner(id) })),
      )
    }
  })
