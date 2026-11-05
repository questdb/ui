import type {
  NotebookVariable,
  NotebookViewState,
} from "../../../../store/notebook"
import { findVariableReferences, variableReferences } from "./references"

export const referencedGlobals = (
  view: NotebookViewState,
  globals: NotebookVariable[],
): NotebookVariable[] => {
  const local = view.settings?.variables ?? []
  const wanted = new Set<string>()
  const collect = (names: Iterable<string>) => {
    for (const name of names) wanted.add(name)
  }
  for (const cell of view.cells) {
    if (cell.type !== "markdown") collect(findVariableReferences(cell.value))
  }
  for (const variable of local) collect(variableReferences(variable))
  const included: NotebookVariable[] = []
  for (let index = globals.length - 1; index >= 0; index -= 1) {
    const global = globals[index]
    if (!wanted.has(global.name.toLowerCase())) {
      continue
    }
    included.unshift(global)
    collect(variableReferences(global))
  }
  return included
}

export type ExportedNotebookViewState = NotebookViewState & {
  settings?: NotebookViewState["settings"] & { globals?: NotebookVariable[] }
}

export const inlineReferencedGlobals = (
  view: NotebookViewState,
  globals: NotebookVariable[],
): ExportedNotebookViewState => {
  const inlined = referencedGlobals(view, globals)
  if (inlined.length === 0) return view
  return { ...view, settings: { ...view.settings, globals: inlined } }
}
