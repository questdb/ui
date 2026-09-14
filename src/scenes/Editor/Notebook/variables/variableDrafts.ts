import type {
  ListVariable,
  NotebookVariable,
  VariableKind,
} from "../../../../store/notebook"
import { isValidVariableName, validateVariableShape } from "../declareUtils"
import { variableToDeclareEntry } from "./declareEntries"
import { compileRegex } from "./listOptions"
import type { VariableScope } from "./scope"
import { isTimeVariableName } from "./timeRange"

export type VariableDraft = {
  key: string
  variable: NotebookVariable
  scope: VariableScope
}

let draftKeySequence = 0

export const newDraftKey = (): string => `v${++draftKeySequence}`

export const createListVariable = (name = ""): ListVariable => ({
  name,
  kind: "list",
  source: { type: "query", query: "", refresh: "onLoad" },
  sort: "none",
  multi: false,
  includeAll: true,
  all: { mode: "list" },
  selected: "all",
})

export const createVariable = (
  kind: VariableKind,
  name = "",
): NotebookVariable => {
  switch (kind) {
    case "expression":
      return { name, kind, value: "" }
    case "text":
      return { name, kind, value: "" }
    case "list":
      return createListVariable(name)
  }
}

export const draftsFromVariables = (
  variables: NotebookVariable[],
  scope: VariableScope,
): VariableDraft[] =>
  variables.map((variable) => ({ key: newDraftKey(), variable, scope }))

export const draftsInScope = (
  drafts: VariableDraft[],
  scope: VariableScope,
): VariableDraft[] => drafts.filter((draft) => draft.scope === scope)

export const orderDraftsByScope = (
  drafts: VariableDraft[],
): VariableDraft[] => [
  ...draftsInScope(drafts, "global"),
  ...draftsInScope(drafts, "notebook"),
]

export const redefinedAtOrAbove = (
  drafts: VariableDraft[],
  index: number,
  redefinedNames: Iterable<string>,
): boolean => {
  const redefined = new Set(redefinedNames)
  return drafts
    .slice(0, index + 1)
    .some((draft) => redefined.has(draft.variable.name))
}

export const variablesFromDrafts = (
  drafts: VariableDraft[],
): NotebookVariable[] =>
  drafts.map((draft) => draft.variable).filter((v) => v.name !== "")

export type DraftProblem =
  | "emptyName"
  | "invalidName"
  | "reservedName"
  | "duplicateName"
  | "emptyValue"
  | "emptyQuery"
  | "emptyValues"
  | "invalidRegex"
  | "invalidShape"

export const NAME_PROBLEMS: DraftProblem[] = [
  "emptyName",
  "invalidName",
  "reservedName",
  "duplicateName",
]

export const PROBLEM_MESSAGES: Record<DraftProblem, string> = {
  emptyName: "Give the variable a name.",
  invalidName:
    "Names start with a letter, underscore, or Unicode character; then letters, digits, underscores, or Unicode characters.",
  reservedName: "This name is declared by the time range.",
  duplicateName: "Name already used.",
  emptyValue: "Give the variable a value.",
  emptyQuery: "Write the query that fetches the values.",
  emptyValues: "Add at least one value.",
  invalidRegex: "The regex does not compile.",
  invalidShape:
    "Value must be a single expression. Wrap it in parentheses if it needs commas.",
}

export const draftProblem = (
  drafts: VariableDraft[],
  index: number,
): DraftProblem | null => {
  const { variable, scope } = drafts[index]
  if (variable.name === "") return "emptyName"
  if (!isValidVariableName(variable.name)) return "invalidName"
  if (isTimeVariableName(variable.name)) return "reservedName"
  if (
    drafts.some(
      (d, i) =>
        i < index && d.scope === scope && d.variable.name === variable.name,
    )
  ) {
    return "duplicateName"
  }
  if (variable.kind === "expression" && variable.value.trim() === "") {
    return "emptyValue"
  }
  if (variable.kind === "list" && variable.source.type === "query") {
    if (variable.source.query.trim() === "") return "emptyQuery"
  }
  if (variable.kind === "list" && variable.source.type === "custom") {
    if (variable.source.entries.trim() === "") return "emptyValues"
  }
  if (
    variable.kind === "list" &&
    variable.source.type === "query" &&
    variable.source.regex &&
    !compileRegex(variable.source.regex)
  ) {
    return "invalidRegex"
  }
  const entry = variableToDeclareEntry(variable, {})
  if (entry && validateVariableShape(entry)) return "invalidShape"
  return null
}
