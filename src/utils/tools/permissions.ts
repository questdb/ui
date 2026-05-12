import type {
  ValidateQueryResult,
  ValidateQuerySuccessResult,
} from "../questdb/types"
import { getQueriesFromText } from "../../scenes/Editor/Monaco/utils"

export type Permissions = {
  grantSchemaAccess: boolean
  read: boolean
  write: boolean
}

export type ToolCategory = "free" | "schema" | "sql"

export const DEFAULT_GRANTED: Permissions = {
  grantSchemaAccess: true,
  read: true,
  write: true,
}

export const DEFAULT_DENIED: Permissions = {
  grantSchemaAccess: false,
  read: false,
  write: false,
}

export const togglePermission = (
  prev: Permissions,
  key: keyof Permissions,
  next: boolean,
): Permissions => {
  if (key === "write" && next) {
    return { grantSchemaAccess: true, read: true, write: true }
  }
  if (key === "read" && next) {
    return { grantSchemaAccess: true, read: true, write: prev.write }
  }
  if (key === "grantSchemaAccess" && !next) {
    return { grantSchemaAccess: false, read: false, write: false }
  }
  if (key === "read" && !next) {
    return { ...prev, read: false, write: false }
  }
  return { ...prev, [key]: next }
}

export type PermissionDecision =
  | { granted: true }
  | { granted: false; reason: string }

const denyReasonForSchemaTool = (tool: string): string =>
  `PERMISSION_DENIED: tool '${tool}' requires the 'grantSchemaAccess' permission. ` +
  "Ask the user to grant it in the QuestDB console (footer → MCP popover or AI Assistant settings)."

const denyReasonForWriteSql = (queryType: string): string =>
  `PERMISSION_DENIED: this SQL is '${queryType}' (write operation) and ` +
  "requires the 'write' permission. Ask the user to grant it in the " +
  "QuestDB console (footer → MCP popover or AI Assistant settings)."

const denyReasonForReadSql = (): string =>
  "PERMISSION_DENIED: this SQL needs the 'read' permission to execute. " +
  "Ask the user to grant it in the QuestDB console (footer → MCP popover or AI Assistant settings)."

const denyReasonNoSql = (tool: string): string =>
  `PERMISSION_DENIED: tool '${tool}' requires a non-empty 'sql' argument.`

export const denyReasonUnresolvedSql = (tool: string): string =>
  `PERMISSION_DENIED: could not resolve SQL for tool '${tool}'. ` +
  "Retry after refreshing notebook state; refusing to execute because the SQL cannot be classified safely."

const denyReasonForDrawWrite = (queryType: string): string =>
  `Cannot draw a write query ('${queryType}'). ` +
  "Draw cells must contain only DQL (SELECT). Switch to Run mode to execute this SQL."

const denyReasonFailClosedClassify = (
  context: "execution" | "draw",
  message: string,
): string =>
  context === "draw"
    ? `Cannot classify cell SQL (validate request failed: ${message}). ` +
      "Refusing to draw until the query can be classified safely."
    : `PERMISSION_DENIED: could not classify SQL (validate request failed: ${message}). ` +
      "Treating as a write to be safe; ask the user to grant 'write' or fix connectivity to QuestDB."

export const checkToolPermission = (
  tool: string,
  category: ToolCategory,
  perms: Permissions,
): PermissionDecision => {
  if (category === "free") return { granted: true }
  if (category === "schema") {
    return perms.grantSchemaAccess
      ? { granted: true }
      : { granted: false, reason: denyReasonForSchemaTool(tool) }
  }
  return {
    granted: false,
    reason: `PERMISSION_DENIED: tool '${tool}' requires SQL classification but was checked as a plain tool.`,
  }
}

const isDqlResult = (
  res: ValidateQuerySuccessResult,
): res is Extract<ValidateQuerySuccessResult, { columns: unknown }> =>
  "columns" in res

export type StatementClass = "DQL" | "DDL_DML" | "ERROR"

export type ClassifiedStatement = {
  sql: string
  klass: StatementClass
  queryType?: string
}

export const classifyStatements = async (
  sql: string,
  validate: (sql: string) => Promise<ValidateQueryResult>,
): Promise<ClassifiedStatement[]> => {
  const statements = getQueriesFromText(sql)
  if (statements.length === 0) return []
  const results = await Promise.all(
    statements.map(async (stmt): Promise<ClassifiedStatement> => {
      const result = await validate(stmt)
      if ("error" in result) return { sql: stmt, klass: "ERROR" }
      if (isDqlResult(result)) return { sql: stmt, klass: "DQL" }
      return { sql: stmt, klass: "DDL_DML", queryType: result.queryType }
    }),
  )
  return results
}

export const classifyAndCheckSqlForRunQuery = async (
  sql: string,
  perms: Permissions,
  validate: (sql: string) => Promise<ValidateQueryResult>,
): Promise<PermissionDecision> => {
  if (sql.trim() === "") {
    return { granted: false, reason: denyReasonNoSql("run_query") }
  }
  let stmts: ClassifiedStatement[]
  try {
    stmts = await classifyStatements(sql, validate)
  } catch (err) {
    const message = err instanceof Error ? err.message : "validate failed"
    return {
      granted: false,
      reason: denyReasonFailClosedClassify("execution", message),
    }
  }
  const writeStmt = stmts.find((s) => s.klass === "DDL_DML")
  if (writeStmt && !perms.write) {
    return {
      granted: false,
      reason: denyReasonForWriteSql(writeStmt.queryType ?? "write"),
    }
  }
  const hasDql = stmts.some((s) => s.klass === "DQL")
  if (hasDql && !perms.read && !perms.write) {
    return { granted: false, reason: denyReasonForReadSql() }
  }
  return { granted: true }
}

// DQL is allowed without `read` because no rows return to the agent — only
// `run_query` (classifyAndCheckSqlForRunQuery) emits row data.
export const classifyAndCheckSqlForExecution = async (
  sql: string,
  perms: Permissions,
  validate: (sql: string) => Promise<ValidateQueryResult>,
): Promise<PermissionDecision> => {
  if (sql.trim() === "") {
    return { granted: false, reason: denyReasonNoSql("run_cell") }
  }
  let stmts: ClassifiedStatement[]
  try {
    stmts = await classifyStatements(sql, validate)
  } catch (err) {
    const message = err instanceof Error ? err.message : "validate failed"
    return {
      granted: false,
      reason: denyReasonFailClosedClassify("execution", message),
    }
  }
  const writeStmt = stmts.find((s) => s.klass === "DDL_DML")
  if (writeStmt && !perms.write) {
    return {
      granted: false,
      reason: denyReasonForWriteSql(writeStmt.queryType ?? "write"),
    }
  }
  return { granted: true }
}

// Permission-independent: drawing a write query is semantically incoherent,
// not a perms question. Empty cells pass.
export const requireAllDQL = async (
  sql: string,
  validate: (sql: string) => Promise<ValidateQueryResult>,
): Promise<PermissionDecision> => {
  let stmts: ClassifiedStatement[]
  try {
    stmts = await classifyStatements(sql, validate)
  } catch (err) {
    const message = err instanceof Error ? err.message : "validate failed"
    return {
      granted: false,
      reason: denyReasonFailClosedClassify("draw", message),
    }
  }
  if (stmts.length === 0) return { granted: true }
  const bad = stmts.find((s) => s.klass === "DDL_DML")
  if (bad) {
    return {
      granted: false,
      reason: denyReasonForDrawWrite(bad.queryType ?? "write"),
    }
  }
  return { granted: true }
}

export type PermissionGateContext = {
  permissions: Permissions
  categoryFor: (tool: string) => ToolCategory
}

// SQL-category tools are NOT gated here; they call the intent-specific SQL
// helpers at the dispatch case so run_query vs run_cell apply different rules.
export const runPermissionGate = (
  tool: string,
  ctx: PermissionGateContext,
): PermissionDecision => {
  const category = ctx.categoryFor(tool)
  if (category === "free" || category === "sql") return { granted: true }
  return checkToolPermission(tool, category, ctx.permissions)
}
