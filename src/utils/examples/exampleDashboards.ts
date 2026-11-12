import type { NotebookViewState } from "../../store/notebook"

// Example files are tab exports from the console (the dexie-export-import
// envelope with a `buffers` table). The first notebook row is the dashboard;
// everything else is ignored. The row goes through the same steps as a tab
// import: it is migrated from the file's database version to the console's,
// then validated and sanitized with the import's whitelist, so persisted
// results and run markers never reach the new tab and every cell starts
// fresh. Example files are never newer than the console that loads them.
export type ExampleDashboardContent = {
  label: string
  notebookViewState: NotebookViewState
}

type DexieEnvelope = {
  data?: {
    databaseVersion?: unknown
    data?: Array<{ tableName?: string; rows?: unknown[] }>
  }
}

// The export's buffer rows and the database version they were written with.
// The version is required: without it the rows cannot be migrated.
const readExport = (json: unknown): { rows: unknown[]; version: number } => {
  const data = Array.isArray(json) ? undefined : (json as DexieEnvelope)?.data
  const version = data?.databaseVersion
  if (typeof version !== "number" || !Array.isArray(data?.data)) {
    throw new Error(
      "The example file is not a console tab export (no database version)",
    )
  }
  const buffers = data.data.find((table) => table?.tableName === "buffers")
  return {
    rows: Array.isArray(buffers?.rows) ? buffers.rows : [],
    version,
  }
}

// dexie-export-import writes rows through typeson: an `undefined` field is
// stored as a placeholder value and listed under `$types` as "undef". The
// console's own importer decodes this; do the same here so a file exported
// from the console is accepted as-is.
const reviveTypeson = (
  record: Record<string, unknown>,
): Record<string, unknown> => {
  const { $types: types, ...rest } = record
  if (typeof types !== "object" || types === null) return rest
  for (const [path, type] of Object.entries(types as Record<string, unknown>)) {
    if (type !== "undef") continue
    const keys = path.split(".")
    const last = keys.pop() as string
    let node: unknown = rest
    for (const key of keys) {
      if (typeof node !== "object" || node === null) {
        node = undefined
        break
      }
      node = (node as Record<string, unknown>)[key]
    }
    if (typeof node === "object" && node !== null) {
      delete (node as Record<string, unknown>)[last]
    }
  }
  return rest
}

const withDefaults = (row: unknown): unknown => {
  if (typeof row !== "object" || row === null) return row
  const record = reviveTypeson(row as Record<string, unknown>)
  return {
    ...record,
    value: typeof record.value === "string" ? record.value : "",
    position: typeof record.position === "number" ? record.position : 0,
  }
}

// importTabs reaches into the Monaco scene, and the migrations into the store;
// load them on demand so the provider that opens examples does not drag them
// into its import graph.
const loadImportTabs = () => import("../../scenes/Editor/Monaco/importTabs")
const loadMigrations = () => import("../../store/migrations")

export const parseExampleDashboard = async (
  json: unknown,
): Promise<ExampleDashboardContent> => {
  const { rows, version } = readExport(json)
  const [
    { sanitizeBuffer, validateBufferItem },
    { getCurrentDbVersion, migrateBuffer },
  ] = await Promise.all([loadImportTabs(), loadMigrations()])
  const currentVersion = getCurrentDbVersion()
  const notebook = rows
    .map(withDefaults)
    .map((row) =>
      typeof row === "object" && row !== null && version < currentVersion
        ? migrateBuffer(row as Record<string, unknown>, version, currentVersion)
        : row,
    )
    .find(
      (row) =>
        typeof row === "object" &&
        row !== null &&
        (row as Record<string, unknown>).notebookViewState !== undefined,
    )
  if (!notebook) {
    throw new Error("The example file contains no notebook tab")
  }
  const validation = validateBufferItem(notebook)
  if (validation !== true) {
    throw new Error(`Invalid example dashboard: ${validation}`)
  }
  const sanitized = sanitizeBuffer(notebook as Record<string, unknown>)
  return {
    label: sanitized.label,
    notebookViewState: sanitized.notebookViewState as NotebookViewState,
  }
}

export const fetchExampleDashboard = async (
  path: string,
  fetchFn: typeof fetch = fetch,
): Promise<ExampleDashboardContent> => {
  const response = await fetchFn(path)
  if (!response.ok) {
    throw new Error(`Could not load ${path} (${response.status})`)
  }
  return parseExampleDashboard(await response.json())
}
