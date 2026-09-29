import { db } from "../../../../../store/db"
import {
  deleteStoredOptions,
  notebookOptionsOwner,
} from "../../../../../store/notebookOptions"
import { normalizeVariables } from "../normalizeVariables"
import { otherNotebooks } from "./globalReferences"

export const removeLocalVariables = (
  names: string[],
  currentBufferId?: number,
): Promise<void> =>
  db.transaction("rw", db.buffers, db.notebook_options, async () => {
    const removedNames = new Set(names.map((name) => name.toLowerCase()))
    for (const buffer of await otherNotebooks(currentBufferId)) {
      const { id, notebookViewState } = buffer
      const variables = normalizeVariables(
        notebookViewState.settings?.variables,
      )
      const removed = variables.filter((variable) =>
        removedNames.has(variable.name.toLowerCase()),
      )
      if (removed.length === 0) continue
      await db.buffers.update(id, {
        notebookViewState: {
          ...notebookViewState,
          settings: {
            ...notebookViewState.settings,
            variables: variables.filter(
              (variable) => !removed.includes(variable),
            ),
          },
        },
      })
      await deleteStoredOptions(
        notebookOptionsOwner(id),
        removed.map((variable) => variable.name),
      )
    }
  })
