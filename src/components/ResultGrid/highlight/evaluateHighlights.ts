import type { ColumnDefinition } from "../../../utils/questdb/types"
import type { CellValue, ResultGridRow } from "../types"
import { columnKindOf, type ColumnKind } from "./columnKind"
import {
  identityColumnIndexes,
  identityKeyOf,
  type IdentityIndex,
} from "./identityIndex"
import {
  ruleAppliesTo,
  type CellDirection,
  type CellHighlight,
  type GradientRule,
  type HighlightConfig,
  type HighlightEvaluation,
  type HighlightRule,
  type MatchStats,
  type PreviousRule,
  type StepsRule,
  type ValueRule,
} from "./types"

type EvaluateInput = {
  columns: ColumnDefinition[]
  dataset: ResultGridRow[]
  config: HighlightConfig
  previous: IdentityIndex | null
}

type ColumnRules = Map<number, HighlightRule[]>

const asNumber = (value: CellValue): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null

const asComparable = (value: CellValue, kind: ColumnKind): number | null => {
  if (kind === "temporal") {
    if (typeof value !== "string") return null
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? null : parsed
  }
  return asNumber(value)
}

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

const resolveTargets = (
  rule: HighlightRule,
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
    if (!rule.enabled) continue
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

const columnAbsMax = (dataset: ResultGridRow[], index: number): number => {
  let max = 0
  for (const row of dataset) {
    const value = asNumber(row[index])
    if (value !== null && Math.abs(value) > max) max = Math.abs(value)
  }
  return max
}

const matchPrevious = (
  rule: PreviousRule,
  value: CellValue,
  previousValue: CellValue,
): CellHighlight | undefined => {
  const hit = { color: rule.color, alpha: 1, display: rule.display }
  const condition = rule.condition
  if (condition.op === "changed") {
    return value !== previousValue ? hit : undefined
  }
  const current = asNumber(value)
  const previous = asNumber(previousValue)
  if (current === null || previous === null) return undefined
  switch (condition.op) {
    case "gt":
      return current > previous ? hit : undefined
    case "lt":
      return current < previous ? hit : undefined
    case "changedBy": {
      const delta = Math.abs(current - previous)
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

const matchValue = (
  rule: ValueRule,
  value: CellValue,
  kind: ColumnKind,
  pattern: RegExp | null,
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
      return value !== null && String(value) === asText(condition.value)
        ? hit
        : undefined
    }
    case "gt":
    case "lt": {
      const current = asComparable(value, kind)
      const expected = asComparableInput(condition.value, kind)
      if (current === null || expected === null) return undefined
      const matches =
        condition.op === "gt" ? current > expected : current < expected
      return matches ? hit : undefined
    }
    case "between": {
      const current = asComparable(value, kind)
      const from = asComparableInput(condition.from, kind)
      const to = asComparableInput(condition.to, kind)
      if (current === null || from === null || to === null) return undefined
      return current >= from && current <= to ? hit : undefined
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

const matchGradient = (
  rule: GradientRule,
  max: number,
  value: CellValue,
): CellHighlight | undefined => {
  const current = asNumber(value)
  if (current === null || current === 0 || max <= 0) return undefined
  return {
    color: current > 0 ? rule.positiveColor : rule.negativeColor,
    alpha: Math.min(1, Math.abs(current) / max),
    display: rule.display,
  }
}

const directionOf = (
  value: CellValue,
  previousValue: CellValue,
): CellDirection | undefined => {
  const current = asNumber(value)
  const previous = asNumber(previousValue)
  if (current === null || previous === null || current === previous) {
    return undefined
  }
  return current > previous ? "up" : "down"
}

const createRuleMatchers = (rules: ColumnRules, dataset: ResultGridRow[]) => {
  const sortedSteps = new Map<string, StepsRule["steps"]>()
  const gradientMax = new Map<string, number>()
  const patterns = new Map<string, RegExp | null>()
  for (const [index, list] of rules) {
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
      if (rule.kind === "gradient") {
        const key = `${rule.id}:${index}`
        gradientMax.set(
          key,
          rule.max === "auto" ? columnAbsMax(dataset, index) : rule.max,
        )
      }
    }
  }
  return (
    rule: HighlightRule,
    index: number,
    kind: ColumnKind,
    value: CellValue,
    previousRow: ResultGridRow | undefined,
  ): CellHighlight | undefined => {
    switch (rule.kind) {
      case "previous":
        return previousRow
          ? matchPrevious(rule, value, previousRow[index])
          : undefined
      case "value":
        return matchValue(rule, value, kind, patterns.get(rule.id) ?? null)
      case "steps":
        return matchSteps(rule, sortedSteps.get(rule.id) ?? [], value)
      case "gradient":
        return matchGradient(
          rule,
          gradientMax.get(`${rule.id}:${index}`) ?? 0,
          value,
        )
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
  const matchRule = createRuleMatchers(rules, dataset)
  const identityIndexes = identityColumnIndexes(columns, config.identityColumns)
  const canCompare = previous !== null && identityIndexes !== null

  const background = new Map<number, CellHighlight>()
  const rowBackground = new Map<number, CellHighlight>()
  const direction = new Map<number, CellDirection>()
  const priority = new Map(config.rules.map((rule, order) => [rule, order]))
  const columnCount = columns.length
  const stats: MatchStats | null = canCompare
    ? { total: dataset.length, matched: 0, added: 0, ambiguous: 0 }
    : null
  const seenKeys = new Set<string>()

  dataset.forEach((row, rowIndex) => {
    let previousRow: ResultGridRow | undefined
    if (canCompare && stats) {
      const key = identityKeyOf(row, identityIndexes)
      if (seenKeys.has(key)) {
        stats.ambiguous++
      } else {
        seenKeys.add(key)
        previousRow = previous.rows.get(key)
        if (previousRow) stats.matched++
        else if (!previous.ambiguous.has(key)) stats.added++
      }
    }
    // Rules are walked per column, so the row channel keeps the hit of the
    // rule listed first rather than the first column that matched.
    let rowHit: { order: number; hit: CellHighlight } | undefined
    for (const [index, list] of rules) {
      const value = row[index]
      const cellKey = rowIndex * columnCount + index
      if (previousRow && directions.has(index)) {
        const cellDirection = directionOf(value, previousRow[index])
        if (cellDirection) direction.set(cellKey, cellDirection)
      }
      for (const rule of list) {
        const hit = matchRule(rule, index, kinds[index], value, previousRow)
        if (!hit) continue
        if (ruleAppliesTo(rule) === "row") {
          const order = priority.get(rule) ?? Number.MAX_SAFE_INTEGER
          if (!rowHit || order < rowHit.order) rowHit = { order, hit }
        } else {
          background.set(cellKey, hit)
        }
        break
      }
    }
    if (rowHit) rowBackground.set(rowIndex, rowHit.hit)
  })

  return {
    lookup: {
      background: (row, col) => background.get(row * columnCount + col),
      row: (row) => rowBackground.get(row),
      direction: (row, col) => direction.get(row * columnCount + col),
      hasDirection: (col) => canCompare && directions.has(col),
    },
    stats,
  }
}
