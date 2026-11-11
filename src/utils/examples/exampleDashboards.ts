import type { NotebookViewState } from "../../store/notebook"

// Example files come in the console's own tab-export format (dexie-export-import
// envelope with a `buffers` table) or as a plain array of tab rows. The first
// notebook row is the dashboard; everything else is ignored. Sanitizing runs
// the same whitelist as an import, so persisted results and run markers never
// reach the new tab and every cell starts fresh.
export type ExampleDashboardContent = {
  label: string
  notebookViewState: NotebookViewState
}

type DexieEnvelope = {
  data?: { data?: Array<{ tableName?: string; rows?: unknown[] }> }
}

const rowsOf = (json: unknown): unknown[] => {
  if (Array.isArray(json)) return json
  const tables = (json as DexieEnvelope)?.data?.data
  if (!Array.isArray(tables)) return []
  const buffers = tables.find((table) => table?.tableName === "buffers")
  return Array.isArray(buffers?.rows) ? buffers.rows : []
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

// importTabs reaches into the Monaco scene; load it on demand so the provider
// that opens examples does not drag the editor into its import graph.
const loadImportTabs = () => import("../../scenes/Editor/Monaco/importTabs")

export const parseExampleDashboard = async (
  json: unknown,
): Promise<ExampleDashboardContent> => {
  const { sanitizeBuffer, validateBufferItem } = await loadImportTabs()
  const notebook = rowsOf(json)
    .map(withDefaults)
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
