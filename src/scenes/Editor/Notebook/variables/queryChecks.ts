import type {
  NotebookVariable,
  VariableOption,
} from "../../../../store/notebook"
import { findVariableReferences, variableReferences } from "./references"
import { isTimeVariableName } from "./timeRange"

type Context = {
  declaredAbove: string[]
  hasTimeRange: boolean
}

const referencePrecheck = (
  references: Iterable<string>,
  { declaredAbove, hasTimeRange }: Context,
): string | null => {
  const above = new Set(declaredAbove.map((name) => name.toLowerCase()))
  for (const reference of references) {
    if (isTimeVariableName(reference)) {
      if (!hasTimeRange) return "Set a time range in the toolbar first."
      continue
    }
    if (!above.has(reference)) {
      return `@${reference} is not declared above this variable. Define it first, or move it up.`
    }
  }
  return null
}

export const queryPrecheck = (
  query: string,
  context: Context,
): string | null =>
  query.trim() === ""
    ? "Write the query that fetches the values."
    : referencePrecheck(findVariableReferences(query), context)

export const variablePrecheck = (
  variable: NotebookVariable,
  context: Context,
): string | null => referencePrecheck(variableReferences(variable), context)

const SQL_LITERAL =
  /^(?:'(?:[^']|'')*'|[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|true|false|null)$/i

export const isLiteralListSelection = (selected: VariableOption[]): boolean =>
  selected.every((option) => SQL_LITERAL.test(option.value.trim()))
