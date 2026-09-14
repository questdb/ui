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
  const afterByName = new Map(after.map((v) => [v.name, serialize(v)]))
  const names = new Set<string>()
  for (const [name, serialized] of afterByName) {
    if (beforeByName.get(name) !== serialized) names.add(name)
  }
  for (const name of beforeByName.keys()) {
    if (!afterByName.has(name)) names.add(name)
  }
  return [...names]
}

export const redefinedVariableNames = (
  before: NotebookVariable[],
  after: NotebookVariable[],
): string[] =>
  changedVariableNames(before.map(definitionOf), after.map(definitionOf))
