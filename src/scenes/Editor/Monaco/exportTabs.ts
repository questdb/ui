import { exportDB } from "dexie-export-import"
import { db } from "../../../store/db"
import type { Buffer } from "../../../store/buffers"

type ExportOptions = { bufferId?: number }

// Pure predicate deciding whether a buffer belongs in an export.
// Temporary and preview buffers are always excluded; when a bufferId is
// given, only that single buffer is kept (single-notebook export).
export const shouldExportBuffer = (
  buffer: Pick<Buffer, "id" | "isTemporary" | "isPreviewBuffer">,
  options?: ExportOptions,
): boolean => {
  if (buffer.isTemporary || buffer.isPreviewBuffer) return false
  if (options?.bufferId !== undefined && buffer.id !== options.bufferId) {
    return false
  }
  return true
}

export const buildExportFileName = (
  options?: ExportOptions,
  timestamp = new Date().toISOString(),
): string => {
  const namePart = options?.bufferId !== undefined ? "notebook" : "tabs"
  return `questdb-${namePart}-${timestamp.replace(/[:.]/g, "-")}.json`
}

type DexieExport = {
  data?: {
    tables?: Array<{ name?: string; rowCount?: number }>
    data?: Array<{ tableName?: string; rows?: unknown[] }>
  }
}

// dexie-export-import stamps each table's `rowCount` from the full table count,
// ignoring the row `filter` — so a filtered export overstates the count and the
// importer's tab-limit check reads it as far more tabs than were emitted. Rewrite
// each rowCount to the rows actually present in the export.
export const reconcileRowCounts = (json: DexieExport): DexieExport => {
  const tables = json.data?.tables
  const tableData = json.data?.data
  if (!Array.isArray(tables) || !Array.isArray(tableData)) return json

  const rowsByTable = new Map<string, number>()
  for (const entry of tableData) {
    if (entry && typeof entry.tableName === "string") {
      rowsByTable.set(
        entry.tableName,
        Array.isArray(entry.rows) ? entry.rows.length : 0,
      )
    }
  }
  for (const table of tables) {
    if (
      table &&
      typeof table.name === "string" &&
      rowsByTable.has(table.name)
    ) {
      table.rowCount = rowsByTable.get(table.name)
    }
  }
  return json
}

export const exportBuffers = async (options?: ExportOptions) => {
  const skipTables = db.tables
    .map((t) => t.name)
    .filter((name) => name !== "buffers")
  const blob = await exportDB(db, {
    skipTables,
    filter: (_table, value) => shouldExportBuffer(value as Buffer, options),
  })

  const reconciled = reconcileRowCounts(
    JSON.parse(await blob.text()) as unknown as DexieExport,
  )
  const finalBlob = new Blob([JSON.stringify(reconciled)], {
    type: "application/json",
  })

  const url = URL.createObjectURL(finalBlob)
  const a = document.createElement("a")
  a.href = url
  a.download = buildExportFileName(options)
  a.click()
  URL.revokeObjectURL(url)
}
