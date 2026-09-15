import type { NotebookVariable } from "../../../../store/notebook"

const withSortedKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(withSortedKeys)
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, withSortedKeys(record[key])]),
    )
  }
  return value
}

const serialize = (variable: NotebookVariable): string =>
  JSON.stringify(withSortedKeys(variable))

export const variablesEqual = (
  a: NotebookVariable[],
  b: NotebookVariable[],
): boolean =>
  a.length === b.length &&
  a.every((variable, index) => serialize(variable) === serialize(b[index]))

const definitionOf = (variable: NotebookVariable): NotebookVariable =>
  variable.kind === "list" ? { ...variable, selected: "all" } : variable

export const changedVariableNames = (
  before: NotebookVariable[],
  after: NotebookVariable[],
): string[] => {
  const beforeByName = new Map(before.map((v) => [v.name, serialize(v)]))
  const afterNames = new Set(after.map((v) => v.name))
  const names = new Set<string>()
  for (const [index, variable] of after.entries()) {
    const { name } = variable
    if (
      beforeByName.get(name) !== serialize(variable) ||
      before[index]?.name !== name
    )
      names.add(name)
  }
  for (const name of beforeByName.keys()) {
    if (!afterNames.has(name)) names.add(name)
  }
  return [...names]
}

export const redefinedVariableNames = (
  before: NotebookVariable[],
  after: NotebookVariable[],
): string[] =>
  changedVariableNames(before.map(definitionOf), after.map(definitionOf))

export const firstRedefinedIndex = (
  before: NotebookVariable[],
  after: NotebookVariable[],
): number => {
  const index = after.findIndex(
    (variable, i) =>
      before[i] === undefined ||
      serialize(definitionOf(before[i])) !== serialize(definitionOf(variable)),
  )
  return index === -1 ? after.length : index
}
