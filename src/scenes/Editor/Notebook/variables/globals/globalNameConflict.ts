import type { NotebookVariable } from "../../../../../store/notebook"
import { normalizeVariables } from "../normalizeVariables"
import { otherNotebooks } from "./globalReferences"

export type GlobalNameConflict = {
  name: string
  notebooks: string[]
}

export const globalNameConflicts = async (
  globals: NotebookVariable[],
  currentBufferId?: number,
): Promise<GlobalNameConflict[]> => {
  if (globals.length === 0) return []
  const notebooksByName = new Map<string, string[]>()
  for (const buffer of await otherNotebooks(currentBufferId)) {
    const variables = normalizeVariables(
      buffer.notebookViewState.settings?.variables,
    )
    for (const variable of variables) {
      const key = variable.name.toLowerCase()
      notebooksByName.set(key, [
        ...(notebooksByName.get(key) ?? []),
        buffer.label,
      ])
    }
  }
  return globals.flatMap((variable) => {
    const notebooks = notebooksByName.get(variable.name.toLowerCase())
    return notebooks ? [{ name: variable.name, notebooks }] : []
  })
}

const quoteList = (labels: string[]): string => {
  const quoted = labels.map((label) => `"${label}"`)
  if (quoted.length === 1) return quoted[0]
  return `${quoted.slice(0, -1).join(", ")} and ${quoted[quoted.length - 1]}`
}

export const describeGlobalNameConflict = ({
  notebooks,
}: GlobalNameConflict): string =>
  `This variable is already defined in ${
    notebooks.length === 1 ? "notebook" : "notebooks"
  } ${quoteList(notebooks)}.`
