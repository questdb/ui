import type { ColumnDefinition } from "../../../utils/questdb/types"
import type { CellValue, ResultGridRow } from "../types"
import { columnKindOf, type ColumnKind } from "./columnKind"
import { columnRangeAt, type ColumnRange } from "./columnRange"
import { unquoted } from "./quotes"
import {
  asComparable,
  asNumeric,
  canonicalInstant,
  compareValues,
  differenceOf,
  toNumber,
  type Comparable,
} from "./comparable"
import {
  identityColumnIndexes,
  identityKeyOf,
  type IdentityIndex,
} from "./identityIndex"
import { compilePattern, type PatternTest } from "./pattern"
import type {
  BetweenBound,
  CellDirection,
  CellHighlight,
  HighlightConfig,
  HighlightEvaluation,
  HighlightRule,
  MatchStats,
  NewRowRule,
  PreviousRule,
  StepsRule,
  TargetedRule,
  ValueCondition,
  ValueRule,
} from "./types"

type EvaluateInput = {
  columns: ColumnDefinition[]
  dataset: ResultGridRow[]
  config: HighlightConfig
  previous: IdentityIndex | null
}

type ColumnRules = Map<number, TargetedRule[]>

type OrderedHit = { order: number; hit: CellHighlight }

const asComparableInput = (
  value: number | string,
  kind: ColumnKind,
): Comparable | null =>
  kind === "temporal"
    ? canonicalInstant(unquoted(value))
    : asNumeric(unquoted(value))

const asBound = (
  bound: BetweenBound,
  end: keyof ColumnRange,
  kind: ColumnKind,
  range: ColumnRange | null,
): Comparable | null =>
  bound === null ? (range?.[end] ?? null) : asComparableInput(bound, kind)

const lower = (a: Comparable, b: Comparable) =>
  compareValues(a, b) <= 0 ? a : b

const higher = (a: Comparable, b: Comparable) =>
  compareValues(a, b) >= 0 ? a : b

// An automatic bound follows the data, but never crosses the fixed one: when
// every value sits beyond it, the range collapses onto the fixed bound and
// the scale keeps its direction.
const resolveBetweenBounds = (
  condition: Extract<ValueCondition, { op: "between" }>,
  kind: ColumnKind,
  range: ColumnRange | null,
): ColumnRange | null => {
  const from = asBound(condition.from, "from", kind, range)
  const to = asBound(condition.to, "to", kind, range)
  if (from === null || to === null) return null
  if (condition.from === null && condition.to !== null) {
    return { from: lower(from, to), to }
  }
  if (condition.to === null && condition.from !== null) {
    return { from, to: higher(to, from) }
  }
  return { from, to }
}

const resolveTargets = (
  rule: TargetedRule,
  columns: ColumnDefinition[],
  kinds: ColumnKind[],
): number[] => {
  if (rule.target.kind === "allNumeric") {
    return kinds.flatMap((kind, index) => (kind === "numeric" ? [index] : []))
  }
  const name = rule.target.name
  const index = columns.findIndex((column) => column.name === name)
  return index === -1 ? [] : [index]
}

const groupRulesByColumn = (
  rules: HighlightRule[],
  columns: ColumnDefinition[],
  kinds: ColumnKind[],
): ColumnRules => {
  const grouped: ColumnRules = new Map()
  for (const rule of rules) {
    if (!rule.enabled || rule.kind === "newRow") continue
    for (const index of resolveTargets(rule, columns, kinds)) {
      const list = grouped.get(index) ?? []
      list.push(rule)
      grouped.set(index, list)
    }
  }
  return grouped
}

const directionColumns = (rules: ColumnRules): Set<number> => {
  const result = new Set<number>()
  for (const [index, list] of rules) {
    const hasDirectionRule = list.some(
      (rule) =>
        rule.kind === "previous" &&
        (rule.condition.op === "gt" || rule.condition.op === "lt"),
    )
    if (hasDirectionRule) result.add(index)
  }
  return result
}

// Array cells arrive as fresh arrays on every result, so they compare by
// content.
const sameCellValue = (a: CellValue, b: CellValue): boolean =>
  a === b ||
  (Array.isArray(a) &&
    Array.isArray(b) &&
    JSON.stringify(a) === JSON.stringify(b))

const matchPrevious = (
  rule: PreviousRule,
  value: CellValue,
  previousValue: CellValue,
  kind: ColumnKind,
): CellHighlight | undefined => {
  const hit = { color: rule.color, display: rule.display }
  const condition = rule.condition
  if (condition.op === "changed") {
    return sameCellValue(value, previousValue) ? undefined : hit
  }
  const current = asComparable(value, kind)
  const previous = asComparable(previousValue, kind)
  if (current === null || previous === null) return undefined
  switch (condition.op) {
    case "gt":
      return compareValues(current, previous) > 0 ? hit : undefined
    case "lt":
      return compareValues(current, previous) < 0 ? hit : undefined
    case "changedBy": {
      if (typeof current === "string" || typeof previous === "string") {
        return undefined
      }
      const delta = Math.abs(differenceOf(current, previous))
      // A threshold of 0 means "any change"; an unchanged cell never matches.
      if (delta === 0) return undefined
      if (condition.unit === "absolute") {
        return delta >= condition.threshold ? hit : undefined
      }
      const base = Math.abs(toNumber(previous))
      if (base === 0) return undefined
      return (delta / base) * 100 >= condition.threshold ? hit : undefined
    }
  }
}

const compare = (
  op: "gt" | "gte" | "lt" | "lte",
  current: Comparable,
  expected: Comparable,
): boolean => {
  const order = compareValues(current, expected)
  switch (op) {
    case "gt":
      return order > 0
    case "gte":
      return order >= 0
    case "lt":
      return order < 0
    case "lte":
      return order <= 0
  }
}

const matchValue = (
  rule: ValueRule,
  value: CellValue,
  kind: ColumnKind,
  pattern: PatternTest | null,
  range: ColumnRange | null,
): CellHighlight | undefined => {
  const hit = { color: rule.color, display: rule.display }
  const condition = rule.condition
  switch (condition.op) {
    case "isNull":
      return value === null ? hit : undefined
    case "matches":
      return value !== null && pattern !== null && pattern(String(value))
        ? hit
        : undefined
    case "contains":
      return typeof value === "string" &&
        value.toLowerCase().includes(unquoted(condition.text).toLowerCase())
        ? hit
        : undefined
    case "eq": {
      if (kind === "numeric" || kind === "temporal") {
        const current = asComparable(value, kind)
        const expected = asComparableInput(condition.value, kind)
        return current !== null &&
          expected !== null &&
          compareValues(current, expected) === 0
          ? hit
          : undefined
      }
      return value !== null &&
        String(value).toLowerCase() === unquoted(condition.value).toLowerCase()
        ? hit
        : undefined
    }
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const current = asComparable(value, kind)
      const expected = asComparableInput(condition.value, kind)
      if (current === null || expected === null) return undefined
      return compare(condition.op, current, expected) ? hit : undefined
    }
    case "between": {
      const current = asComparable(value, kind)
      const bounds = resolveBetweenBounds(condition, kind, range)
      if (current === null || bounds === null) return undefined
      const { from, to } = bounds
      const inRange =
        compareValues(current, from) >= 0 && compareValues(current, to) <= 0
      if (condition.fill.kind === "solid") {
        return inRange ? hit : undefined
      }
      if (
        typeof current === "string" ||
        typeof from === "string" ||
        typeof to === "string"
      ) {
        return undefined
      }
      const ratio =
        compareValues(current, to) >= 0
          ? 1
          : compareValues(current, from) <= 0
            ? 0
            : differenceOf(current, from) / differenceOf(to, from)
      return { ...hit, blend: { color: condition.fill.highColor, ratio } }
    }
  }
}

// Steps arrive sorted from the highest bound down, so the first one the
// value reaches is the highest.
const matchSteps = (
  rule: StepsRule,
  sortedSteps: StepsRule["steps"],
  value: CellValue,
): CellHighlight | undefined => {
  const current = asNumeric(value)
  if (current === null) return undefined
  const step = sortedSteps.find(
    (candidate) => compareValues(current, candidate.from) >= 0,
  )
  return {
    color: step?.color ?? rule.baseColor,
    display: rule.display,
  }
}

const hasAutoBound = (rule: ValueRule): boolean =>
  rule.condition.op === "between" &&
  (rule.condition.from === null || rule.condition.to === null)

const directionOf = (
  value: CellValue,
  previousValue: CellValue,
  kind: ColumnKind,
): CellDirection | undefined => {
  const current = asComparable(value, kind)
  const previous = asComparable(previousValue, kind)
  if (current === null || previous === null) return undefined
  const order = compareValues(current, previous)
  if (order === 0) return undefined
  return order > 0 ? "up" : "down"
}

const createRuleMatchers = (
  rules: ColumnRules,
  columns: ColumnDefinition[],
  dataset: ResultGridRow[],
) => {
  const sortedSteps = new Map<string, StepsRule["steps"]>()
  const patterns = new Map<string, PatternTest | null>()
  const ranges = new Map<number, ColumnRange | null>()
  const rangeAt = (index: number): ColumnRange | null => {
    if (!ranges.has(index)) {
      ranges.set(index, columnRangeAt(columns, dataset, index))
    }
    return ranges.get(index) ?? null
  }
  for (const list of rules.values()) {
    for (const rule of list) {
      if (
        rule.kind === "value" &&
        rule.condition.op === "matches" &&
        !patterns.has(rule.id)
      ) {
        patterns.set(rule.id, compilePattern(rule.condition.pattern))
      }
      if (rule.kind === "steps" && !sortedSteps.has(rule.id)) {
        sortedSteps.set(
          rule.id,
          [...rule.steps].sort((a, b) => b.from - a.from),
        )
      }
    }
  }
  return (
    rule: TargetedRule,
    index: number,
    kind: ColumnKind,
    value: CellValue,
    previousRow: ResultGridRow | undefined,
  ): CellHighlight | undefined => {
    switch (rule.kind) {
      case "previous":
        return previousRow
          ? matchPrevious(rule, value, previousRow[index], kind)
          : undefined
      case "value":
        return matchValue(
          rule,
          value,
          kind,
          patterns.get(rule.id) ?? null,
          hasAutoBound(rule) ? rangeAt(index) : null,
        )
      case "steps":
        return matchSteps(rule, sortedSteps.get(rule.id) ?? [], value)
    }
  }
}

type RowEvaluation = {
  cells: Map<number, OrderedHit>
  row: OrderedHit | undefined
  directions: Map<number, CellDirection>
}

const EMPTY_ROW: RowEvaluation = {
  cells: new Map(),
  row: undefined,
  directions: new Map(),
}

type Comparison = {
  previous: IdentityIndex
  identityIndexes: number[]
  firstRowByKey: Map<string, number>
  stats: MatchStats
}

// The first row of an identity key is the one that compares; a later
// duplicate is ambiguous and compares with nothing. One pass over the keys
// settles that for every row and yields the match stats.
const compareRows = (
  dataset: ResultGridRow[],
  previous: IdentityIndex,
  identityIndexes: number[],
): Comparison => {
  const firstRowByKey = new Map<string, number>()
  const stats: MatchStats = {
    total: dataset.length,
    matched: 0,
    added: 0,
    ambiguous: 0,
  }
  dataset.forEach((row, rowIndex) => {
    const key = identityKeyOf(row, identityIndexes)
    if (firstRowByKey.has(key)) {
      stats.ambiguous++
      return
    }
    firstRowByKey.set(key, rowIndex)
    if (previous.rows.has(key)) stats.matched++
    else if (!previous.ambiguous.has(key)) stats.added++
  })
  return { previous, identityIndexes, firstRowByKey, stats }
}

const previousRowOf = (
  comparison: Comparison | null,
  row: ResultGridRow,
  rowIndex: number,
): { previousRow: ResultGridRow | undefined; added: boolean } => {
  if (comparison === null) return { previousRow: undefined, added: false }
  const key = identityKeyOf(row, comparison.identityIndexes)
  if (comparison.firstRowByKey.get(key) !== rowIndex) {
    return { previousRow: undefined, added: false }
  }
  const previousRow = comparison.previous.rows.get(key)
  return {
    previousRow,
    added: previousRow === undefined && !comparison.previous.ambiguous.has(key),
  }
}

// Rules run per row on first lookup, so a refresh pays for the rows the grid
// renders rather than for the whole result.
export const evaluateHighlights = ({
  columns,
  dataset,
  config,
  previous,
}: EvaluateInput): HighlightEvaluation => {
  const kinds = columns.map(columnKindOf)
  const rules = groupRulesByColumn(config.rules, columns, kinds)
  const directions = directionColumns(rules)
  const matchRule = createRuleMatchers(rules, columns, dataset)
  const identityIndexes = identityColumnIndexes(columns, config.identityColumns)
  const comparison =
    previous !== null && identityIndexes !== null
      ? compareRows(dataset, previous, identityIndexes)
      : null
  const priority = new Map(config.rules.map((rule, order) => [rule, order]))
  // The first enabled new-row rule wins for the row channel; list order
  // still decides against cell rules.
  const newRowRule = config.rules.find(
    (rule): rule is NewRowRule => rule.enabled && rule.kind === "newRow",
  )

  const evaluateRow = (rowIndex: number): RowEvaluation => {
    const row = dataset[rowIndex]
    if (row === undefined) return EMPTY_ROW
    const { previousRow, added } = previousRowOf(comparison, row, rowIndex)
    const cells = new Map<number, OrderedHit>()
    const rowDirections = new Map<number, CellDirection>()
    // Rules are walked per column, so the row channel keeps the hit of the
    // rule listed first rather than the first column that matched. A cell
    // hit settles its own cell, but the column keeps looking for a row rule
    // so the rest of the row still gets painted.
    let rowHit: OrderedHit | undefined
    if (added && newRowRule) {
      rowHit = {
        order: priority.get(newRowRule) ?? Number.MAX_SAFE_INTEGER,
        hit: { color: newRowRule.color, display: newRowRule.display },
      }
    }
    for (const [index, list] of rules) {
      const value = row[index]
      if (previousRow && directions.has(index)) {
        const cellDirection = directionOf(
          value,
          previousRow[index],
          kinds[index],
        )
        if (cellDirection) rowDirections.set(index, cellDirection)
      }
      let cellHit: OrderedHit | undefined
      for (const rule of list) {
        if (cellHit && rule.appliesTo !== "row") continue
        const hit = matchRule(rule, index, kinds[index], value, previousRow)
        if (!hit) continue
        const order = priority.get(rule) ?? Number.MAX_SAFE_INTEGER
        if (rule.appliesTo === "row") {
          if (!rowHit || order < rowHit.order) rowHit = { order, hit }
          break
        }
        cellHit = { order, hit }
        cells.set(index, cellHit)
      }
    }
    return { cells, row: rowHit, directions: rowDirections }
  }

  const rows = new Map<number, RowEvaluation>()
  const rowAt = (rowIndex: number): RowEvaluation => {
    const cached = rows.get(rowIndex)
    if (cached) return cached
    const evaluated = evaluateRow(rowIndex)
    rows.set(rowIndex, evaluated)
    return evaluated
  }

  // List order decides for every cell; a row rule counts as a match for each
  // cell of its row.
  const winner = (row: number, col: number): CellHighlight | undefined => {
    const evaluated = rowAt(row)
    const cell = evaluated.cells.get(col)
    const rowHit = evaluated.row
    if (cell && rowHit) return cell.order < rowHit.order ? cell.hit : rowHit.hit
    return (cell ?? rowHit)?.hit
  }

  return {
    lookup: {
      background: winner,
      row: (row) => rowAt(row).row?.hit,
      direction: (row, col) => rowAt(row).directions.get(col),
      hasDirection: (col) => comparison !== null && directions.has(col),
    },
    stats: comparison?.stats ?? null,
  }
}
