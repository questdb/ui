import { tokenize } from "@questdb/sql-parser"
import type { DeclareEntry, NotebookVariable } from "../../../../store/notebook"

export const findVariableReferences = (sql: string): Set<string> => {
  const names = new Set<string>()
  for (const token of tokenize(sql).tokens) {
    if (token.tokenType.name === "VariableReference") {
      names.add(token.image.slice(1).toLowerCase())
    }
  }
  return names
}

const sourceText = (variable: NotebookVariable): string => {
  if (variable.kind !== "list") return variable.value
  return variable.source.type === "query"
    ? variable.source.query
    : variable.source.entries
}

export const variableReferences = (variable: NotebookVariable): Set<string> =>
  findVariableReferences(sourceText(variable))

export const referencesAny = (
  sql: string,
  names: Iterable<string>,
): boolean => {
  const found = findVariableReferences(sql)
  for (const name of names) {
    if (found.has(name.toLowerCase())) return true
  }
  return false
}

export const referencedDeclareEntries = (
  sql: string,
  entries: DeclareEntry[],
): DeclareEntry[] => {
  const needed = findVariableReferences(sql)
  const kept: DeclareEntry[] = []
  for (const entry of [...entries].reverse()) {
    if (!needed.has(entry.name.toLowerCase())) continue
    kept.unshift(entry)
    for (const name of findVariableReferences(entry.value)) needed.add(name)
  }
  return kept
}
