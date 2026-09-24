import { truncateLongDDL } from "../../components/LiteEditor/utils"
import { formatSql } from "../../utils/formatSql"

export type QueryPreview = {
  text: string
  grayedOutLines: [number, number] | null
}

const PREVIEW_MAX_LINES = 10

export const formatQuery = (query: string): string => {
  try {
    return formatSql(query)
  } catch {
    return query
  }
}

export const buildQueryPreview = (formattedQuery: string): QueryPreview =>
  truncateLongDDL(formattedQuery, PREVIEW_MAX_LINES)
