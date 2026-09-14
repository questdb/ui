import type {
  AllMode,
  ExpressionVariable,
  ListSort,
  ListSource,
  ListVariable,
  NotebookVariable,
  TextVariable,
  VariableOption,
} from "../../../../store/notebook"

type RawRecord = Record<string, unknown>

type VariableBase = Pick<NotebookVariable, "name" | "label" | "description">

const LIST_SORTS: ListSort[] = [
  "none",
  "alphaAsc",
  "alphaDesc",
  "numAsc",
  "numDesc",
]

const isRecord = (value: unknown): value is RawRecord =>
  typeof value === "object" && value !== null

const optionalString = (value: unknown): string | undefined =>
  typeof value === "string" && value !== "" ? value : undefined

const readBase = (raw: RawRecord): VariableBase | null => {
  if (typeof raw.name !== "string") return null
  return {
    name: raw.name,
    label: optionalString(raw.label),
    description: optionalString(raw.description),
  }
}

const readExpression = (
  raw: RawRecord,
  base: VariableBase,
): ExpressionVariable | null =>
  typeof raw.value === "string"
    ? { ...base, kind: "expression", value: raw.value }
    : null

const readText = (raw: RawRecord, base: VariableBase): TextVariable | null =>
  typeof raw.value === "string"
    ? { ...base, kind: "text", value: raw.value }
    : null

const readSource = (raw: unknown): ListSource | null => {
  if (!isRecord(raw)) return null
  if (raw.type === "query" && typeof raw.query === "string") {
    return {
      type: "query",
      query: raw.query,
      refresh:
        raw.refresh === "onTimeRangeChange" ? "onTimeRangeChange" : "onLoad",
      labelColumn: optionalString(raw.labelColumn),
      regex: optionalString(raw.regex),
    }
  }
  if (raw.type === "custom" && typeof raw.entries === "string") {
    return { type: "custom", entries: raw.entries }
  }
  return null
}

const readOption = (raw: unknown): VariableOption | null => {
  if (!isRecord(raw) || typeof raw.value !== "string") return null
  return {
    value: raw.value,
    label: typeof raw.label === "string" ? raw.label : raw.value,
  }
}

const readSelected = (
  raw: unknown,
  includeAll: boolean,
): ListVariable["selected"] => {
  if (Array.isArray(raw)) {
    return raw.flatMap((item) => {
      const option = readOption(item)
      return option ? [option] : []
    })
  }
  return includeAll ? "all" : []
}

const readAll = (raw: unknown): AllMode =>
  isRecord(raw) && raw.mode === "custom" && typeof raw.value === "string"
    ? { mode: "custom", value: raw.value }
    : { mode: "list" }

const readList = (raw: RawRecord, base: VariableBase): ListVariable | null => {
  const source = readSource(raw.source)
  if (!source) return null
  const includeAll = raw.includeAll === true
  return {
    ...base,
    kind: "list",
    source,
    sort: LIST_SORTS.includes(raw.sort as ListSort)
      ? (raw.sort as ListSort)
      : "none",
    multi: raw.multi === true,
    includeAll,
    all: readAll(raw.all),
    selected: readSelected(raw.selected, includeAll),
  }
}

export const normalizeVariable = (raw: unknown): NotebookVariable | null => {
  if (!isRecord(raw)) return null
  const base = readBase(raw)
  if (!base) return null
  switch (raw.kind) {
    case "text":
      return readText(raw, base)
    case "list":
      return readList(raw, base)
    case "expression":
    case undefined:
    case null:
      return readExpression(raw, base)
    default:
      return null
  }
}

export type NormalizedVariables = {
  variables: NotebookVariable[]
  dropped: string[]
}

const droppedName = (raw: unknown): string =>
  isRecord(raw) && typeof raw.name === "string" && raw.name !== ""
    ? raw.name
    : "unnamed"

export const normalizeVariableList = (raw: unknown[]): NormalizedVariables => {
  const result: NormalizedVariables = { variables: [], dropped: [] }
  for (const item of raw) {
    const variable = normalizeVariable(item)
    if (variable) result.variables.push(variable)
    else result.dropped.push(droppedName(item))
  }
  return result
}

export const normalizeVariables = (raw: unknown): NotebookVariable[] => {
  if (Array.isArray(raw)) return normalizeVariableList(raw).variables
  if (isRecord(raw)) {
    return Object.entries(raw).flatMap(([name, value]) =>
      typeof value === "string"
        ? [{ name, kind: "expression" as const, value }]
        : [],
    )
  }
  return []
}
