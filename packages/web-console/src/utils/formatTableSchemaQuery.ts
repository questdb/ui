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
}

type Props = {
  name: string
  partitionBy: string
  timestamp: string
  walEnabled: boolean
  schemaColumns: Column[]
}

export const formatTableSchemaQuery = ({
  name,
  partitionBy,
  timestamp,
  walEnabled,
  schemaColumns,
}: Props) => {
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

  if (timestamp) {
    query += ` timestamp (${timestamp})`
  }

  if (partitionBy !== "NONE") {
    query += ` PARTITION BY ${partitionBy}`
  }

  if (walEnabled) {
    query += " WAL"
  }

  return `${formatSql(query)};`
}
