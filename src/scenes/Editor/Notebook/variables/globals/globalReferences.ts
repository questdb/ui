import { db } from "../../../../../store/db"
import type { Buffer } from "../../../../../store/buffers"
import type { NotebookViewState } from "../../../../../store/notebook"
import { normalizeVariables } from "../normalizeVariables"
import { findVariableReferences, variableReferences } from "../references"

export type GlobalReference = {
  name: string
  notebooks: string[]
}

export const referencedNamesIn = (
  viewState: NotebookViewState,
  names: string[],
): string[] => {
  const found = new Set<string>()
  for (const cell of viewState.cells) {
    if (cell.type === "markdown") continue
    for (const name of findVariableReferences(cell.value)) found.add(name)
  }
  for (const variable of normalizeVariables(viewState.settings?.variables)) {
    for (const name of variableReferences(variable)) found.add(name)
  }
  return names.filter((name) => found.has(name.toLowerCase()))
}

export const otherNotebooks = async (
  currentBufferId?: number,
): Promise<(Buffer & { id: number; notebookViewState: NotebookViewState })[]> =>
  (await db.buffers.toArray()).flatMap((buffer) =>
    buffer.id !== undefined &&
    buffer.id !== currentBufferId &&
    buffer.notebookViewState
      ? [
          {
            ...buffer,
            id: buffer.id,
            notebookViewState: buffer.notebookViewState,
          },
        ]
      : [],
  )

export const globalReferences = async (
  names: string[],
  currentBufferId?: number,
): Promise<GlobalReference[]> => {
  if (names.length === 0) return []
  const notebooksByName = new Map<string, string[]>()
  for (const buffer of await otherNotebooks(currentBufferId)) {
    for (const name of referencedNamesIn(buffer.notebookViewState, names)) {
      notebooksByName.set(name, [
        ...(notebooksByName.get(name) ?? []),
        buffer.label,
      ])
    }
  }
  return names.flatMap((name) => {
    const notebooks = notebooksByName.get(name)
    return notebooks ? [{ name, notebooks }] : []
  })
}
