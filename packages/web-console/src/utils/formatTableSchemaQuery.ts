import { trim } from "ramda"
import { formatSql } from "../utils"

type Column = {
  column: string
  indexed?: boolean
  designated?: boolean
  indexBlockCapacity?: number
  symbolCached?: boolean
  symbolCapacity?: number
  type: string
  upsertKey?: boolean
}

type Props = {
  name: string
  partitionBy: string
  timestamp: string
  dedup: boolean
  walEnabled: boolean
  schemaColumns: Column[]
}

export const formatTableSchemaQuery = ({
  name,
  partitionBy,
  timestamp,
  walEnabled,
  dedup,
  schemaColumns,
}: Props) => {
  const hasValidTimestamp =
    timestamp &&
    schemaColumns.find((c) => c.column === timestamp && c.type === "TIMESTAMP")

  let query = `CREATE TABLE '${name}' (`

  for (let i = 0; i < schemaColumns.length; i++) {
    const {
      column,
      type,
      indexed,
      indexBlockCapacity,
      symbolCached,
      symbolCapacity,
    } = schemaColumns[i]

    query += `${column} ${type} `

    if (type === "SYMBOL") {
      query += symbolCapacity ? `capacity ${symbolCapacity} ` : ""
      if (symbolCached) {
        query += "CACHE "
      }
    }

    if (indexed) {
      query += "index "
      if (indexBlockCapacity) {
        query += `capacity ${indexBlockCapacity} `
      }
    }

    query = trim(query)

    if (i !== schemaColumns.length - 1) {
      query += ", "
    }
  }

  query += ")"

  if (hasValidTimestamp) {
    query += ` timestamp (${timestamp})`
  }

  if (partitionBy !== "NONE") {
    query += ` PARTITION BY ${partitionBy} ${walEnabled ? "WAL" : "BYPASS WAL"}`
  }

  // For deduplication keys to work, WAL has to be enabled and a designated timestamp has to be set.
  if (walEnabled && dedup && hasValidTimestamp) {
    const upsertColumns = schemaColumns.filter((c) => c.upsertKey)
    if (upsertColumns.length > 0) {
      // Designated timestamp has to be part of the deduplication keys. We add it if user forgot.
      const hasTimestampInKeys = upsertColumns.find(
        (c) => c.column === timestamp,
      )
      const keyColumns = hasTimestampInKeys
        ? upsertColumns
        : [...upsertColumns, { column: timestamp }]

      query += ` DEDUP UPSERT KEYS(${keyColumns
        .map((c) => c.column)
        .join(",")})`
    }
  }

  return `${formatSql(query)};`
}
