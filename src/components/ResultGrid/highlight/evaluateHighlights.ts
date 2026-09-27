import type { ColumnDefinition } from "../../../utils/questdb/types"
import type { CellValue, ResultGridRow } from "../types"
import { columnKindOf, type ColumnKind } from "./columnKind"
import { columnRangeAt, type ColumnRange } from "./columnRange"
import { asComparable, asNumber } from "./comparable"
import {
  identityColumnIndexes,
  identityKeyOf,
  type IdentityIndex,
} from "./identityIndex"
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

// SQL habits carry over: a typed 'EURUSD' or "EURUSD" means EURUSD.
const asText = (value: number | string): string => {
  const text = String(value).trim()
  const quoted =
    text.length >= 2 &&
    ((text.startsWith("'") && text.endsWith("'")) ||
      (text.startsWith('"') && text.endsWith('"')))
  return quoted ? text.slice(1, -1) : text
}

// `/pattern/flags` carries flags; a bare pattern is case-sensitive. An
// invalid pattern never matches instead of throwing mid-render.
export const compilePattern = (pattern: string): RegExp | null => {
  const text = pattern.trim()
  const slashed = /^\/(.+)\/([a-z]*)$/.exec(text)
  try {
    return slashed ? new RegExp(slashed[1], slashed[2]) : new RegExp(text)
  } catch {
    return null
  }
}

const asComparableInput = (
  value: number | string,
  kind: ColumnKind,
): number | null => {
  if (kind === "temporal") {
    const parsed = Date.parse(asText(value))
    return Number.isNaN(parsed) ? null : parsed
  }
  const parsed = typeof value === "number" ? value : Number(asText(value))
  return Number.isFinite(parsed) ? parsed : null
}

const asBound = (
  bound: BetweenBound,
  end: keyof ColumnRange,
  kind: ColumnKind,
  range: ColumnRange | null,
): number | null =>
  bound === null ? (range?.[end] ?? null) : asComparableInput(bound, kind)

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

const matchPrevious = (
  rule: PreviousRule,
  value: CellValue,
  previousValue: CellValue,
  kind: ColumnKind,
): CellHighlight | undefined => {
  const hit = { color: rule.color, alpha: 1, display: rule.display }
  const condition = rule.condition
  if (condition.op === "changed") {
    return value !== previousValue ? hit : undefined
  }
  const current = asComparable(value, kind)
  const previous = asComparable(previousValue, kind)
  if (current === null || previous === null) return undefined
  switch (condition.op) {
    case "gt":
      return current > previous ? hit : undefined
    case "lt":
      return current < previous ? hit : undefined
    case "changedBy": {
      const delta = Math.abs(current - previous)
      // A threshold of 0 means "any change"; an unchanged cell never matches.
      if (delta === 0) return undefined
      if (condition.unit === "absolute") {
        return delta >= condition.threshold ? hit : undefined
      }
      if (previous === 0) return undefined
      return (delta / Math.abs(previous)) * 100 >= condition.threshold
        ? hit
        : undefined
    }
  }
}

const compare = (
  op: "gt" | "gte" | "lt" | "lte",
  current: number,
  expected: number,
): boolean => {
  switch (op) {
    case "gt":
      return current > expected
    case "gte":
      return current >= expected
    case "lt":
      return current < expected
    case "lte":
      return current <= expected
  }
}

const matchValue = (
  rule: ValueRule,
  value: CellValue,
  kind: ColumnKind,
  pattern: RegExp | null,
  range: ColumnRange | null,
): CellHighlight | undefined => {
  const hit = { color: rule.color, alpha: 1, display: rule.display }
  const condition = rule.condition
  switch (condition.op) {
    case "isNull":
      return value === null ? hit : undefined
    case "matches":
      return value !== null && pattern !== null && pattern.test(String(value))
        ? hit
        : undefined
    case "contains":
      return typeof value === "string" &&
        value.toLowerCase().includes(asText(condition.text).toLowerCase())
        ? hit
        : undefined
    case "eq": {
      if (kind === "numeric" || kind === "temporal") {
        const current = asComparable(value, kind)
        const expected = asComparableInput(condition.value, kind)
        return current !== null && current === expected ? hit : undefined
      }
      return value !== null &&
        String(value).toLowerCase() === asText(condition.value).toLowerCase()
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
      const from = asBound(condition.from, "from", kind, range)
      const to = asBound(condition.to, "to", kind, range)
      if (current === null || from === null || to === null) return undefined
      if (condition.fill.kind === "solid") {
        return current >= from && current <= to ? hit : undefined
      }
      const ratio =
        to === from
          ? 1
          : Math.min(1, Math.max(0, (current - from) / (to - from)))
      return { ...hit, blend: { color: condition.fill.highColor, ratio } }
    }
  }
}

const matchSteps = (
  rule: StepsRule,
  sortedSteps: StepsRule["steps"],
  value: CellValue,
): CellHighlight | undefined => {
  const current = asNumber(value)
  if (current === null) return undefined
  const step = sortedSteps.find((candidate) => current < candidate.below)
  return {
    color: step?.color ?? rule.remainderColor,
    alpha: 1,
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
  if (current === null || previous === null || current === previous) {
    return undefined
  }
  return current > previous ? "up" : "down"
}

const createRuleMatchers = (
  rules: ColumnRules,
  columns: ColumnDefinition[],
  dataset: ResultGridRow[],
) => {
  const sortedSteps = new Map<string, StepsRule["steps"]>()
  const patterns = new Map<string, RegExp | null>()
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
          [...rule.steps].sort((a, b) => a.below - b.below),
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
  const canCompare = previous !== null && identityIndexes !== null

  const background = new Map<number, OrderedHit>()
  const rowBackground = new Map<number, OrderedHit>()
  const direction = new Map<number, CellDirection>()
  const priority = new Map(config.rules.map((rule, order) => [rule, order]))
  // The first enabled new-row rule wins for the row channel; list order
  // still decides against cell rules.
  const newRowRule = config.rules.find(
    (rule): rule is NewRowRule => rule.enabled && rule.kind === "newRow",
  )
  const columnCount = columns.length
  const stats: MatchStats | null = canCompare
    ? { total: dataset.length, matched: 0, added: 0, ambiguous: 0 }
    : null
  const seenKeys = new Set<string>()

  dataset.forEach((row, rowIndex) => {
    let previousRow: ResultGridRow | undefined
    let added = false
    if (canCompare && stats) {
      const key = identityKeyOf(row, identityIndexes)
      if (seenKeys.has(key)) {
        stats.ambiguous++
      } else {
        seenKeys.add(key)
        previousRow = previous.rows.get(key)
        added = previousRow === undefined && !previous.ambiguous.has(key)
        if (previousRow) stats.matched++
        else if (added) stats.added++
      }
    }
    // Rules are walked per column, so the row channel keeps the hit of the
    // rule listed first rather than the first column that matched. A cell
    // hit settles its own cell, but the column keeps looking for a row rule
    // so the rest of the row still gets painted.
    let rowHit: OrderedHit | undefined
    if (added && newRowRule) {
      rowHit = {
        order: priority.get(newRowRule) ?? Number.MAX_SAFE_INTEGER,
        hit: { color: newRowRule.color, alpha: 1, display: newRowRule.display },
      }
    }
    for (const [index, list] of rules) {
      const value = row[index]
      const cellKey = rowIndex * columnCount + index
      if (previousRow && directions.has(index)) {
        const cellDirection = directionOf(
          value,
          previousRow[index],
          kinds[index],
        )
        if (cellDirection) direction.set(cellKey, cellDirection)
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
        background.set(cellKey, cellHit)
      }
    }
    if (rowHit) rowBackground.set(rowIndex, rowHit)
  })

  // List order decides for every cell; a row rule counts as a match for each
  // cell of its row.
  const winner = (row: number, col: number): CellHighlight | undefined => {
    const cell = background.get(row * columnCount + col)
    const rowHit = rowBackground.get(row)
    if (cell && rowHit) return cell.order < rowHit.order ? cell.hit : rowHit.hit
    return (cell ?? rowHit)?.hit
  }

  return {
    lookup: {
      background: winner,
      row: (row) => rowBackground.get(row)?.hit,
      direction: (row, col) => direction.get(row * columnCount + col),
      hasDirection: (col) => canCompare && directions.has(col),
    },
    stats,
  }
}
