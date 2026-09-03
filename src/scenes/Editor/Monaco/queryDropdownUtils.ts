import type { Request } from "./utils"

const formatQueryText = (queryText: string) =>
  queryText.length > 30
    ? `"${queryText.substring(0, 30)}..."`
    : `"${queryText}"`

export const extractQueryTextToRun = (query?: Request) => {
  if (!query) return "query"
  return formatQueryText(
    query.selection ? query.selection.queryText : query.query,
  )
}

export const extractFullQueryText = (query?: Request) =>
  query ? formatQueryText(query.query) : "query"
