import { tokenize } from "@questdb/sql-parser"
import { getQueriesFromText } from "../../Monaco/utils"
import { parseDeclareBlock } from "../declareUtils"

// Only names matter here. Variable values and list options stay owned by the
// destination notebook, independently of the clipboard and undo history.
export const findMissingVariables = (
  sql: string,
  availableNames: Iterable<string>,
): string[] => {
  const available = new Set(
    Array.from(availableNames, (name) => name.toLowerCase()),
  )
  const missing = new Set<string>()
  for (const statement of getQueriesFromText(sql)) {
    const local = new Set(
      parseDeclareBlock(statement).map(({ name }) => name.toLowerCase()),
    )
    for (const token of tokenize(statement).tokens) {
      if (token.tokenType.name !== "VariableReference") continue
      const name = token.image.slice(1).toLowerCase()
      if (!available.has(name) && !local.has(name)) missing.add(name)
    }
  }
  return [...missing]
}
