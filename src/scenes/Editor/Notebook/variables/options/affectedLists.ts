import type { NotebookVariable } from "../../../../../store/notebook"
import { variableReferences } from "../references"
import { TIME_VARIABLE_NAMES } from "../timeRange"
import { isQueryList, type QueryListVariable } from "./fetchVariableOptions"

const lower = (name: string) => name.toLowerCase()

const referencesAffected = (
  variable: NotebookVariable,
  affected: Set<string>,
): boolean => {
  for (const name of variableReferences(variable)) {
    if (affected.has(name)) return true
  }
  return false
}

const closeOver = (
  variables: NotebookVariable[],
  seeds: Iterable<string>,
  isSeedList: (list: QueryListVariable) => boolean,
): QueryListVariable[] => {
  const affected = new Set([...seeds].map(lower))
  const result: QueryListVariable[] = []
  for (const variable of variables) {
    const list = isQueryList(variable) ? variable : null
    if (
      !(list !== null && isSeedList(list)) &&
      !referencesAffected(variable, affected)
    ) {
      continue
    }
    affected.add(lower(variable.name))
    if (list) result.push(list)
  }
  return result
}

export const listsAffectedByChange = (
  variables: NotebookVariable[],
  changedNames: string[],
  redefinedNames: string[],
): QueryListVariable[] => {
  const redefined = new Set(redefinedNames.map(lower))
  return closeOver(variables, changedNames, (list) =>
    redefined.has(lower(list.name)),
  )
}

export const listsRefreshedWith = (
  variables: NotebookVariable[],
  name: string,
): QueryListVariable[] => listsAffectedByChange(variables, [name], [name])

export const listsAffectedByTimeRange = (
  variables: NotebookVariable[],
): QueryListVariable[] => closeOver(variables, TIME_VARIABLE_NAMES, () => false)
