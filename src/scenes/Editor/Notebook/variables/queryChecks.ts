import { findVariableReferences } from "./references"
import { isTimeVariableName } from "./timeRange"

type Context = {
  declaredAbove: string[]
  hasTimeRange: boolean
}

export const queryPrecheck = (
  query: string,
  { declaredAbove, hasTimeRange }: Context,
): string | null => {
  if (query.trim() === "") return "Write the query that fetches the values."
  const above = new Set(declaredAbove.map((name) => name.toLowerCase()))
  for (const reference of findVariableReferences(query)) {
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
