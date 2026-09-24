import { normalizeSql } from "../../../utils/formatSql"
import { sqlHash } from "../../../utils/sqlHash"

// Prefixed with a non-digit so the key is never an integer-like string, which
// object key ordering would enumerate first and break insertion-order LRUs.
export const queryKeyFor = (query: string): string => {
  try {
    return "q" + sqlHash(normalizeSql(query, false))
  } catch {
    return "q" + sqlHash(query.trim())
  }
}
