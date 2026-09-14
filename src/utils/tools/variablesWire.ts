const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const RENAMED_KEYS: Record<string, string> = {
  include_all: "includeAll",
  label_column: "labelColumn",
}

const renameKeys = (raw: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [
      RENAMED_KEYS[key] ?? key,
      value,
    ]),
  )

export const wireVariableToStored = (raw: unknown): unknown => {
  if (!isRecord(raw)) return raw
  const renamed = renameKeys(raw)
  if (isRecord(renamed.source)) renamed.source = renameKeys(renamed.source)
  return renamed
}

const KINDS = ["expression", "text", "list"]

export const describeWireVariableError = (raw: unknown): string | null => {
  if (!isRecord(raw)) return "must be an object"
  if (typeof raw.name !== "string") return "must have a string name"
  const kind = raw.kind ?? "expression"
  if (!KINDS.includes(kind as string)) {
    return `has unknown kind ${JSON.stringify(kind)}; use one of ${KINDS.join(", ")}`
  }
  if (kind === "list") {
    const source = raw.source
    if (!isRecord(source)) return "list variables need a source object"
    if (source.type === "query" && typeof source.query !== "string") {
      return "query sources need a string query"
    }
    if (source.type === "custom" && typeof source.entries !== "string") {
      return "custom sources need string entries"
    }
    if (source.type !== "query" && source.type !== "custom") {
      return 'source.type must be "query" or "custom"'
    }
    return null
  }
  return typeof raw.value === "string" ? null : "must have a string value"
}
