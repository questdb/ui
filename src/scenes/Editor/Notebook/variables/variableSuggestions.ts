import type { VariableSuggestion } from "../../Monaco/questdb-sql/variableCompletion"
import type { DeclareEntry, NotebookVariable } from "../../../../store/notebook"
import { effectiveVariables } from "./scope"
import { isTimeVariableName } from "./timeRange"

const TIME_RANGE_DESCRIPTION = "Notebook time range"

export const variableSuggestions = (
  globals: NotebookVariable[],
  local: NotebookVariable[],
  entries: DeclareEntry[],
): VariableSuggestion[] => {
  const values = new Map(entries.map((entry) => [entry.name, entry.value]))
  const timeBuiltIns = entries
    .filter((entry) => isTimeVariableName(entry.name))
    .map((entry) => ({
      name: entry.name,
      value: entry.value,
      description: TIME_RANGE_DESCRIPTION,
    }))
  const user = effectiveVariables(globals, local).map(
    ({ variable, scope }) => ({
      name: variable.name,
      value: values.get(variable.name),
      description:
        variable.description ??
        (scope === "global" ? "All notebooks" : "This notebook"),
    }),
  )
  return [...timeBuiltIns, ...user]
}
