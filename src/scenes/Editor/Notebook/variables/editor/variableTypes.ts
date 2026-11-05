import type {
  ListVariable,
  NotebookVariable,
} from "../../../../../store/notebook"
import type { VariableScope } from "../scope"
import { createListVariable, createVariable } from "../variableDrafts"

export type VariableType = "fixed" | "text" | "custom"

export type ListSourceType = ListVariable["source"]["type"]

export const TYPE_OPTIONS: {
  value: VariableType
  label: string
  description: string
}[] = [
  {
    value: "fixed",
    label: "Fixed",
    description: "One value, inserted exactly as written.",
  },
  {
    value: "text",
    label: "Textbox",
    description: "Free text typed in the variables bar.",
  },
  {
    value: "custom",
    label: "Custom",
    description: "A picker fed by a query or by values you define.",
  },
]

export const SCOPE_OPTIONS: {
  value: VariableScope
  label: string
  description: string
}[] = [
  {
    value: "notebook",
    label: "This notebook",
    description: "Set this variable only for the current notebook.",
  },
  {
    value: "global",
    label: "All notebooks",
    description:
      "Set this variable for all notebooks. Variable names must be unique.",
  },
]

export const variableTypeOf = (variable: NotebookVariable): VariableType => {
  switch (variable.kind) {
    case "expression":
      return "fixed"
    case "text":
      return "text"
    case "list":
      return "custom"
  }
}

export const withVariableType = (
  variable: NotebookVariable,
  type: VariableType,
): NotebookVariable => {
  if (variableTypeOf(variable) === type) return variable
  const base = { label: variable.label, description: variable.description }
  switch (type) {
    case "fixed":
      return { ...createVariable("expression", variable.name), ...base }
    case "text":
      return { ...createVariable("text", variable.name), ...base }
    case "custom":
      return { ...createListVariable(variable.name), ...base }
  }
}

export const withListSource = (
  variable: ListVariable,
  source: ListSourceType,
): ListVariable => {
  if (variable.source.type === source) return variable
  return {
    ...variable,
    source:
      source === "query"
        ? { type: "query", query: "" }
        : { type: "custom", entries: "" },
  }
}
