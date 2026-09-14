import type {
  DeclareEntry,
  ListVariable,
  NotebookSettings,
  NotebookVariable,
  VariableOption,
} from "../../../../store/notebook"
import { customListOptions } from "./listOptions"
import { declaresName } from "./scope"
import { timeRangeToDeclareEntries } from "./timeRange"

export type ListOptionsState = {
  options: VariableOption[]
}

export type ListOptionsByName = Record<string, ListOptionsState>

const renderValues = (values: string[]): string =>
  values.length === 1 ? values[0] : `(${values.join(", ")})`

const listOptionsFor = (
  variable: ListVariable,
  listOptions: ListOptionsByName,
): ListOptionsState | null =>
  variable.source.type === "custom"
    ? { options: customListOptions(variable) }
    : (listOptions[variable.name] ?? null)

const listValue = (
  variable: ListVariable,
  listOptions: ListOptionsByName,
): string | null => {
  const state = listOptionsFor(variable, listOptions)
  if (variable.selected === "all") {
    if (variable.all.mode === "custom") {
      return variable.all.value.trim() === "" ? null : variable.all.value
    }
    if (!state || state.options.length === 0) return null
    return renderValues(state.options.map((option) => option.value))
  }
  if (variable.selected.length === 0) return null
  return renderValues(variable.selected.map((option) => option.value))
}

export const variableToDeclareEntry = (
  variable: NotebookVariable,
  listOptions: ListOptionsByName,
): DeclareEntry | null => {
  switch (variable.kind) {
    case "expression":
      return variable.value.trim() === ""
        ? null
        : { name: variable.name, value: variable.value }
    case "text":
      return variable.value.trim() === ""
        ? null
        : { name: variable.name, value: variable.value }
    case "list": {
      const value = listValue(variable, listOptions)
      return value === null ? null : { name: variable.name, value }
    }
  }
}

export const declareEntriesAbove = (
  settings: NotebookSettings,
  listOptions: ListOptionsByName,
  globalEntries: DeclareEntry[],
  name: string,
): DeclareEntry[] => {
  const variables = settings.variables ?? []
  const index = variables.findIndex((variable) => variable.name === name)
  return buildDeclareEntries(
    {
      timeRange: settings.timeRange,
      variables: variables.slice(0, Math.max(index, 0)),
    },
    listOptions,
    globalEntries,
  )
}

export const buildDeclareEntries = (
  settings: NotebookSettings,
  listOptions: ListOptionsByName = {},
  globalEntries: DeclareEntry[] = [],
): DeclareEntry[] => {
  const local = settings.variables ?? []
  return [
    ...(settings.timeRange
      ? timeRangeToDeclareEntries(settings.timeRange)
      : []),
    ...globalEntries.filter((entry) => !declaresName(local, entry.name)),
    ...local.flatMap((variable) => {
      const entry = variableToDeclareEntry(variable, listOptions)
      return entry ? [entry] : []
    }),
  ]
}
