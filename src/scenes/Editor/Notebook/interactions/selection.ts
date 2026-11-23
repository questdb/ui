// What a click on a chart mark, a component item or a grid cell selects.
//
// The rule: a click writes the value of column X in the row(s) the clicked
// mark was drawn from. X is the bound column (`click.column`) when set,
// otherwise the column the mark is drawn from (a bar's category, a lane's
// lane column, a level's price…). A mark drawn from several rows writes X
// only when every one of them holds the same value. The value is written as
// a SQL literal typed by that statement's column. With no X, or an X the
// statement does not have, the click writes nothing: never a label, a
// formatted value, a coordinate or a size.
//
// Builders describe each clickable mark with a `Pick`: the statement and rows
// it was drawn from, and the column it is drawn from. `pickLiteral` turns a
// pick into the value a click writes.

const INTEGER_TYPES = new Set(["BYTE", "SHORT", "INT", "LONG"])

/**
 * A value as a SQL literal: numbers as they are, text quoted. LONG and
 * DECIMAL values arrive as decimal text, so the column's SQL type, when
 * known, keeps them numbers: `42`, and `1.50m` for a DECIMAL.
 */
export const sqlLiteral = (value: unknown, type?: string): string => {
  if (value === null || value === undefined) return "null"
  if (typeof value === "number")
    return Number.isFinite(value) ? String(value) : "null"
  if (typeof value === "boolean") return value ? "true" : "false"
  if (typeof value === "string" && type !== undefined) {
    if (INTEGER_TYPES.has(type) && /^-?\d+$/.test(value)) return value
    if (type.startsWith("DECIMAL") && /^-?\d+(\.\d+)?$/.test(value))
      return `${value}m`
  }
  const text = typeof value === "string" ? value : JSON.stringify(value)
  return `'${text.replace(/'/g, "''")}'`
}

/**
 * A clickable mark's source: the index of its statement among the cell's
 * statements, the indexes of the rows it was drawn from, and the index of the
 * column it is drawn from (what an unbound click selects), when it has one.
 */
export type Pick = { statement: number; rows: number[]; column?: number }

/** A statement's result, as far as a pick reads it. */
export type PickSource = {
  columns: readonly { name: string; type: string }[]
  rows: readonly (readonly unknown[])[]
}

export type PickSources = readonly (PickSource | null | undefined)[]

/** The key a data item carries its pick under. */
export const PICK_KEY = "pick"

/** A pick of `rows` of a statement, drawn from `column` when it is one. */
export const pickOf = (
  statement: number,
  rows: number[],
  column?: number,
): Pick =>
  column === undefined || column < 0
    ? { statement, rows }
    : { statement, rows, column }

/** The pick of a mark drawn from the rows of both. */
export const mergePicks = (
  a: Pick | undefined,
  b: Pick | undefined,
): Pick | undefined => {
  if (!a) return b
  if (!b) return a
  // Marks never merge across statements; such a mark has no single source.
  if (a.statement !== b.statement) return undefined
  return pickOf(
    a.statement,
    [...a.rows, ...b.rows],
    a.column === b.column ? a.column : undefined,
  )
}

const isIndex = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0

/** The pick `value` describes, if it is one. */
export const asPick = (value: unknown): Pick | undefined => {
  if (typeof value !== "object" || value === null) return undefined
  const { statement, rows, column } = value as Record<string, unknown>
  if (!isIndex(statement) || !Array.isArray(rows) || !rows.every(isIndex))
    return undefined
  if (column !== undefined && !isIndex(column)) return undefined
  return pickOf(statement, rows, column)
}

/** A data item with its pick; the item unchanged without one. */
export const withPick = <T extends object>(
  item: T,
  pick: Pick | undefined,
): T => (pick ? { ...item, [PICK_KEY]: pick } : item)

/** The pick a data item carries. */
export const pickOfItem = (item: unknown): Pick | undefined =>
  typeof item === "object" &&
  item !== null &&
  !Array.isArray(item) &&
  Object.hasOwn(item, PICK_KEY)
    ? asPick((item as Record<string, unknown>)[PICK_KEY])
    : undefined

/**
 * Dataset rows carry their source in two hidden dimensions, so a row keeps
 * it through ECharts dataset transforms (filter, sort).
 */
export const STATEMENT_DIMENSION = "__statement"
export const ROW_DIMENSION = "__row"

/** Click params, as far as a pick is read from them. */
export type PickParams = {
  data?: unknown
  value?: unknown
  dimensionNames?: (string | undefined | null)[] | null
  // A dataset-bound series' statement and the column it draws its marks
  // from, by name (see buildCustomOption's `datasetSource`).
  datasetStatement?: number
  drawnColumn?: string
}

/**
 * The pick of a clicked item: the one it carries, else the hidden dimensions
 * of the dataset row it was drawn from.
 */
export const pickOfParams = (
  params: PickParams,
  statements: PickSources,
): Pick | undefined => {
  const carried = pickOfItem(params.data)
  if (carried) return carried
  const value = params.value
  if (!Array.isArray(value)) return undefined
  const names = Array.isArray(params.dimensionNames)
    ? params.dimensionNames
    : []
  let statementAt = names.indexOf(STATEMENT_DIMENSION)
  let rowAt = names.indexOf(ROW_DIMENSION)
  // Some series (a pie) name no dimensions: the hidden ones follow the
  // statement's columns.
  const known = params.datasetStatement
  if ((statementAt < 0 || rowAt < 0) && known !== undefined) {
    statementAt = statements[known]?.columns.length ?? -1
    rowAt = statementAt + 1
  }
  if (statementAt < 0 || rowAt < 0) return undefined
  const statement = value[statementAt] as unknown
  const row = value[rowAt] as unknown
  if (!isIndex(statement) || !isIndex(row)) return undefined
  if (known !== undefined && statement !== known) return undefined
  const columns = statements[statement]?.columns ?? []
  const drawn =
    params.drawnColumn === undefined
      ? -1
      : columns.findIndex((c) => c.name === params.drawnColumn)
  return pickOf(statement, [row], drawn)
}

/**
 * The SQL literal a click on `pick` writes: column `bound` (else the pick's
 * drawn column) of its rows, typed by its statement's column. Undefined when
 * there is no such column or its rows disagree: the click writes nothing.
 */
export const pickLiteral = (
  pick: Pick | undefined,
  bound: string | undefined,
  statements: PickSources,
): string | undefined => {
  if (!pick || pick.rows.length === 0) return undefined
  const statement = statements[pick.statement]
  if (!statement) return undefined
  const column =
    bound === undefined
      ? pick.column
      : statement.columns.findIndex((c) => c.name === bound)
  if (column === undefined || column < 0 || column >= statement.columns.length)
    return undefined
  const type = statement.columns[column].type
  let literal: string | undefined
  for (const index of pick.rows) {
    const row = statement.rows[index]
    if (!row) return undefined
    // Values compare as literals: LONG and DECIMAL text stays exact.
    const next = sqlLiteral(row[column], type)
    if (literal === undefined) literal = next
    else if (literal !== next) return undefined
  }
  return literal
}

/**
 * A problem with a bound click column that none of the statements returns:
 * no click on the cell can write it.
 */
export const boundColumnProblem = (
  bound: string | undefined,
  statements: PickSources,
): string | undefined =>
  bound === undefined ||
  statements.every((s) => !s) ||
  statements.some((s) => s?.columns.some((c) => c.name === bound))
    ? undefined
    : `Click column ${JSON.stringify(bound)} not found.`
