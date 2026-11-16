import { parse } from "@questdb/sql-parser"
import type { CstNode, IToken } from "@chevrotain/types"
import type { NotebookVariable } from "../../../store/notebook"
import type { Client } from "../../../utils/questdb/client"
import { maskParserBlockComments } from "../../../utils/parserSql"

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
}

const extractLeadingDeclare = (text: string): LeadingDeclareInfo | null => {
  const { cst } = parse(maskParserBlockComments(text))
  if (!cst) return null

  const decl = findFirstNode(cst, "declareClause")
  if (!decl) return null

  if (!subtreeRange(decl)) return null

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
  return { assignments, hasInvalidAssignment }
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

// The `variables` parameter of /exec, /exp and /api/v1/sql/validate: the
// assignments of a DECLARE block, which the server reads as a DECLARE block
// that opens the statement. The range of each assignment lets an error the
// server reports in the parameter name its variable.
export type VariablesParameter = {
  text: string
  assignments: Array<{ name: string; start: number; end: number }>
}

// A line comment that ends a value ends at the newline, before the comma.
const ASSIGNMENT_SEPARATOR = "\n, "

export const renderVariablesParameter = (
  globals: unknown,
): VariablesParameter | undefined => {
  let text = ""
  const assignments: VariablesParameter["assignments"] = []
  for (const { name, value } of normalizeVariables(globals)) {
    if (!isValidVariableName(name)) continue
    if (assignments.length > 0) text += ASSIGNMENT_SEPARATOR
    const start = text.length
    text += `@${name} := ${value}`
    assignments.push({ name, start, end: text.length })
  }
  return assignments.length > 0 ? { text, assignments } : undefined
}

// The text a statement runs as, which tells apart the results of one
// statement run with other variable values.
export const effectiveQueryOf = (
  sql: string,
  variables: VariablesParameter | undefined,
): string => (variables ? `DECLARE ${variables.text}\n${sql}` : sql)

type ServerError = {
  error: string
  position: number
  errorSource?: "variables"
}

// An error the server reports in the variables has a position in the
// parameter. Point it at the start of the statement and name the variable.
export const mapVariablesError = <T extends ServerError>(
  variables: VariablesParameter | undefined,
  result: T,
): T => {
  if (result.errorSource !== "variables") return result
  const { errorSource: _, ...rest } = result
  const assignment = variables?.assignments
    .filter(({ start }) => start <= result.position)
    .pop()
  return {
    ...rest,
    position: 0,
    error: assignment
      ? `${result.error} (in variable @${assignment.name})`
      : `${result.error} (in variables)`,
  } as T
}

export const createValidateWithGlobals =
  (
    quest: Pick<Client, "validateQuery">,
    getVariables: () => NotebookVariable[] | undefined,
  ) =>
  async (sql: string, signal?: AbortSignal) => {
    const variables = renderVariablesParameter(getVariables())
    const result = await quest.validateQuery(sql, signal, variables?.text)
    return "error" in result ? mapVariablesError(variables, result) : result
  }
