import { parse, tokenize } from "@questdb/sql-parser"
import type { CstNode, IToken } from "@chevrotain/types"
import type { NotebookVariable } from "../../../store/notebook"

const NAME_RE = /^[a-zA-Z\u0080-\uFFFF_][a-zA-Z0-9\u0080-\uFFFF_]*$/

export const isValidVariableName = (name: string): boolean => NAME_RE.test(name)

const isVariableLike = (value: unknown): value is NotebookVariable => {
  if (!value || typeof value !== "object") return false
  const candidate = value as { name?: unknown; value?: unknown }
  return (
    typeof candidate.name === "string" && typeof candidate.value === "string"
  )
}

export const normalizeVariables = (raw: unknown): NotebookVariable[] => {
  if (Array.isArray(raw)) {
    return raw.flatMap((v) =>
      isVariableLike(v) ? [{ name: v.name, value: v.value }] : [],
    )
  }
  if (raw && typeof raw === "object") {
    return Object.entries(raw).flatMap(([name, value]) =>
      typeof value === "string" ? [{ name, value }] : [],
    )
  }
  return []
}

export const expandGlobals = (sql: string, globals: unknown): string => {
  const normalized = normalizeVariables(globals)
  return normalized.length > 0
    ? prependGlobalsDeclare(sql, normalized).sql
    : sql
}

export const stripLeadingAt = (raw: string): string =>
  raw.startsWith("@") ? raw.slice(1) : raw

export const renderDeclareBlock = (variables: NotebookVariable[]): string => {
  const valid = variables.filter(({ name }) => isValidVariableName(name))
  if (valid.length === 0) return ""
  const lines = valid.map(({ name, value }) => `  @${name} := ${value}`)
  return `DECLARE\n${lines.join(",\n")}`
}

export const renderDeclareValidationQuery = (
  variables: NotebookVariable[],
): string => {
  const block = renderDeclareBlock(variables)
  return block ? `${block}\nSELECT 1` : "SELECT 1"
}

const isToken = (n: CstNode | IToken): n is IToken =>
  (n as IToken).image !== undefined

const findFirstNode = (root: CstNode, name: string): CstNode | null => {
  if (root.name === name) return root
  const children = root.children
  for (const key of Object.keys(children)) {
    for (const child of children[key]) {
      if (isToken(child)) continue
      const found = findFirstNode(child, name)
      if (found) return found
    }
  }
  return null
}

const subtreeRange = (node: CstNode): { start: number; end: number } | null => {
  let start = Infinity
  let end = -1
  const visit = (n: CstNode): void => {
    for (const key of Object.keys(n.children)) {
      for (const child of n.children[key]) {
        if (isToken(child)) {
          if (child.startOffset < start) start = child.startOffset
          const ce = child.endOffset ?? child.startOffset
          if (ce > end) end = ce
        } else {
          visit(child)
        }
      }
    }
  }
  visit(node)
  return end < 0 ? null : { start, end }
}

type UserDeclareAssignment = {
  name: string
  originalText: string
}

type LeadingDeclareInfo = {
  assignments: UserDeclareAssignment[]
  hasInvalidAssignment: boolean
  blockStart: number
  bodyStart: number
}

const extractLeadingDeclare = (text: string): LeadingDeclareInfo | null => {
  const { cst } = parse(text)
  if (!cst) return null

  const decl = findFirstNode(cst, "declareClause")
  if (!decl) return null

  const range = subtreeRange(decl)
  if (!range) return null

  const assignments: UserDeclareAssignment[] = []
  let hasInvalidAssignment = false
  const rawAssignments = decl.children.declareAssignment ?? []
  for (const a of rawAssignments) {
    if (isToken(a)) continue
    const aRange = subtreeRange(a)
    if (!aRange) {
      hasInvalidAssignment = true
      continue
    }
    const nameTok = a.children.VariableReference?.[0] as IToken | undefined
    const exprNode = a.children.expression?.[0] as CstNode | undefined
    const hasColonEquals = Boolean(a.children.ColonEquals)
    if (!nameTok || !exprNode || !hasColonEquals) {
      hasInvalidAssignment = true
      continue
    }
    const name = nameTok.image.slice(1)
    if (!isValidVariableName(name)) {
      hasInvalidAssignment = true
      continue
    }
    assignments.push({
      name,
      originalText: text.slice(aRange.start, aRange.end + 1),
    })
  }
  return {
    assignments,
    hasInvalidAssignment,
    blockStart: range.start,
    bodyStart: range.end + 1,
  }
}

export const parseDeclareBlock = (text: string): NotebookVariable[] => {
  const info = extractLeadingDeclare(text)
  if (!info) return []
  const out: NotebookVariable[] = []
  for (const a of info.assignments) {
    // Strip leading OVERRIDABLE for the map-style consumer (popover etc.).
    const eqIdx = a.originalText.indexOf(":=")
    if (eqIdx < 0) continue
    out.push({ name: a.name, value: a.originalText.slice(eqIdx + 2).trim() })
  }
  return out
}

export type VariableShapeError =
  | { kind: "parse" }
  | { kind: "count"; actual: number }
  | { kind: "name"; expected: string; actual: string }
  | { kind: "value"; expected: string; actual: string }

export const validateVariableShape = (
  variable: NotebookVariable,
): VariableShapeError | null => {
  if (!isValidVariableName(variable.name)) return { kind: "parse" }
  const block = renderDeclareBlock([variable])
  const info = extractLeadingDeclare(block)
  if (!info || info.hasInvalidAssignment) return { kind: "parse" }
  if (info.assignments.length !== 1) {
    return { kind: "count", actual: info.assignments.length }
  }
  const a = info.assignments[0]
  if (a.name !== variable.name) {
    return { kind: "name", expected: variable.name, actual: a.name }
  }
  const expectedText = `@${variable.name} := ${variable.value.trim()}`
  if (a.originalText.trim() !== expectedText) {
    return {
      kind: "value",
      expected: expectedText,
      actual: a.originalText.trim(),
    }
  }
  return null
}

export type InsertedRange = { start: number; end: number; delta: number }

export type PreparedSql = {
  sql: string
  // Information about the rewrite, or null if no rewrite happened.
  insertedRange: InsertedRange | null
}

export type WireErrorPosition =
  | { kind: "passthrough"; position: number }
  | { kind: "inDeclareBlock"; position: number }
  | { kind: "shifted"; position: number }

export const mapWireErrorPosition = (
  range: InsertedRange,
  wirePosition: number,
): WireErrorPosition => {
  if (wirePosition < range.start) {
    return { kind: "passthrough", position: wirePosition }
  }
  if (wirePosition < range.end) {
    return { kind: "inDeclareBlock", position: range.start }
  }
  return { kind: "shifted", position: wirePosition - range.delta }
}

const NO_OP = (sql: string): PreparedSql => ({ sql, insertedRange: null })

const renderMergedDeclare = (
  globals: NotebookVariable[],
  userAssignments: UserDeclareAssignment[],
): string => {
  const validGlobalLines = globals
    .filter(({ name }) => isValidVariableName(name))
    .map(({ name, value }) => `  @${name} := ${value}`)
  const userLines = userAssignments.map((a) => `  ${a.originalText}`)
  const lines = [...validGlobalLines, ...userLines]
  if (lines.length === 0) return ""
  return `DECLARE\n${lines.join(",\n")}`
}

type StatementShape =
  | { kind: "select" }
  | { kind: "leadingDeclare"; info: LeadingDeclareInfo }
  | { kind: "skip" }

const analyzeStatement = (text: string): StatementShape => {
  const r = parse(text)
  // Any parse error or recovery-induced multi-statement shape: refuse to
  // rewrite. The user's broken SQL surfaces server errors directly.
  if (r.parseErrors.length > 0) return { kind: "skip" }
  if (!r.cst) return { kind: "skip" }
  const stmtChildren = (r.cst.children.statement ?? []).filter(
    (s): s is CstNode => !isToken(s),
  )
  if (stmtChildren.length !== 1) return { kind: "skip" }
  const stmt = stmtChildren[0]

  if (stmt.children.selectStatement) {
    const sel = stmt.children.selectStatement[0]
    if (isToken(sel) || !sel.children.selectBody) return { kind: "skip" }
    if (sel.children.declareClause) {
      const info = extractLeadingDeclare(text)
      if (!info || info.hasInvalidAssignment) return { kind: "skip" }
      return { kind: "leadingDeclare", info }
    }
    return { kind: "select" }
  }

  if (stmt.children.withStatement) {
    const w = stmt.children.withStatement[0]
    if (isToken(w)) return { kind: "skip" }
    // WITH … <body>. Only a SELECT body is safe to prepend DECLARE before
    // (DECLARE grammar is `DECLARE … [WITH …] SELECT …`). WITH … INSERT,
    // WITH … UPDATE, etc. are valid user SQL but not valid DECLARE targets.
    if (w.children.selectBody) return { kind: "select" }
    return { kind: "skip" }
  }

  // INSERT / CREATE / UPDATE / DELETE / ALTER / DROP / SHOW / TRUNCATE / etc.
  return { kind: "skip" }
}

export const prependGlobalsDeclare = (
  sql: string,
  globals: NotebookVariable[],
): PreparedSql => {
  if (globals.length === 0) return NO_OP(sql)

  const { tokens } = tokenize(sql)
  if (tokens.length === 0) return NO_OP(sql)

  const first = tokens[0]

  // EXPLAIN is the one form we handle by stripping and recursing — the inner
  // statement's grammar is what matters (`EXPLAIN DECLARE … SELECT …` is the
  // only valid shape; `EXPLAIN WITH … INSERT …` is valid user SQL but not a
  // DECLARE target). The recursive call's analyzer makes that call.
  if (first.tokenType.name === "Explain") {
    // QuestDBLexer is configured with `positionTracking: "full"`, so every
    // token has both startOffset and endOffset as numbers. Asserting `!`
    // here documents that invariant; the recursion is bounded by sql.length
    // because suffixStart is always >= 1 (endOffset >= startOffset >= 0).
    const suffixStart = first.endOffset! + 1
    const recursed = prependGlobalsDeclare(sql.slice(suffixStart), globals)
    if (!recursed.insertedRange) return NO_OP(sql)
    return {
      sql: sql.slice(0, suffixStart) + recursed.sql,
      insertedRange: {
        start: suffixStart + recursed.insertedRange.start,
        end: suffixStart + recursed.insertedRange.end,
        delta: recursed.insertedRange.delta,
      },
    }
  }

  const shape = analyzeStatement(sql)
  if (shape.kind === "skip") return NO_OP(sql)

  if (shape.kind === "select") {
    const valid = globals.filter(({ name }) => isValidVariableName(name))
    if (valid.length === 0) return NO_OP(sql)
    const block = renderDeclareBlock(valid) + "\n"
    return {
      sql:
        sql.slice(0, first.startOffset) + block + sql.slice(first.startOffset),
      insertedRange: {
        start: first.startOffset,
        end: first.startOffset + block.length,
        delta: block.length,
      },
    }
  }

  // shape.kind === "leadingDeclare"
  const { info } = shape
  const userNames = new Set(info.assignments.map((a) => a.name))
  const filtered = globals.filter(
    ({ name }) => isValidVariableName(name) && !userNames.has(name),
  )
  if (filtered.length === 0) return NO_OP(sql)
  const newBlock = renderMergedDeclare(filtered, info.assignments)
  const originalBlock = sql.slice(info.blockStart, info.bodyStart)
  return {
    sql: sql.slice(0, info.blockStart) + newBlock + sql.slice(info.bodyStart),
    insertedRange: {
      start: info.blockStart,
      // `end` covers the full wire DECLARE block (globals + user locals).
      // We can't back-map inside this range uniformly because we may have
      // rewritten the inter-assignment separators; treat any error inside
      // as "in DECLARE block" and only shift positions AFTER it.
      end: info.blockStart + newBlock.length,
      delta: newBlock.length - originalBlock.length,
    },
  }
}
