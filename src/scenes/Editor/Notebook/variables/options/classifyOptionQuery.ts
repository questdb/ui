import type { DeclareEntry } from "../../../../../store/notebook"
import type { ValidateQueryResult } from "../../../../../utils/questdb/types"
import { getQueriesFromText } from "../../../Monaco/utils"
import { prependGlobalsDeclare } from "../../declareUtils"
import { referencedDeclareEntries } from "../references"

export type OptionQueryVerdict = { ok: true } | { ok: false; error: string }

export const classifyOptionQuery = async (
  query: string,
  entriesAbove: DeclareEntry[],
  validate: (sql: string) => Promise<ValidateQueryResult>,
): Promise<OptionQueryVerdict> => {
  if (getQueriesFromText(query).length !== 1) {
    return { ok: false, error: "The query must be a single statement." }
  }
  const result = await validate(
    prependGlobalsDeclare(query, referencedDeclareEntries(query, entriesAbove))
      .sql,
  )
  if ("error" in result) return { ok: false, error: result.error }
  if (!("columns" in result)) {
    return {
      ok: false,
      error: `The option query must be a SELECT, not ${result.queryType}.`,
    }
  }
  return { ok: true }
}
