import type {
  ValidateQueryResult,
  ValidateQuerySuccessResult,
} from "../questdb/types"
import {
  getQueriesFromText,
  normalizeQueryText,
} from "../../scenes/Editor/Monaco/utils"

export type Permissions = {
  grantSchemaAccess: boolean
  read: boolean
  write: boolean
}

export type ToolCategory = "free" | "schema" | "sql"

export const DEFAULT_GRANTED: Permissions = {
  grantSchemaAccess: true,
  read: true,
  write: false,
}

export const DEFAULT_DENIED: Permissions = {
  grantSchemaAccess: false,
  read: false,
  write: false,
}

export const normalizePermissions = (raw: Permissions): Permissions => {
  if (raw.write) return { grantSchemaAccess: true, read: true, write: true }
  if (raw.read) return { grantSchemaAccess: true, read: true, write: false }
  return { grantSchemaAccess: raw.grantSchemaAccess, read: false, write: false }
}

export type PermissionDecision =
  | { granted: true }
  | { granted: false; reason: string }

export const denyReasonForSchemaTool = (tool: string): string =>
  `PERMISSION_DENIED: tool '${tool}' requires the 'grantSchemaAccess' permission. ` +
  "Ask the user to grant it in the QuestDB console (footer → MCP popover or AI Assistant settings)."

export const denyReasonForWriteSql = (queryType: string): string =>
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

export const denyReasonForDrawWrite = (queryType: string): string =>
  `Cannot draw a write query ('${queryType}'). ` +
  "Draw cells must contain only DQL (SELECT). Switch to Run mode to execute this SQL."

export const denyReasonFailClosedClassify = (
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
  error?: string
  errorPosition?: number
}

type CachedStatementClass =
  | { klass: "DQL" }
  | { klass: "DDL_DML"; queryType?: string }

// Successful classes are grammar-stable for a given text, so they cache
// safely. ERROR is schema-dependent (a missing table can appear later) and
// is revalidated on every classification.
const STATEMENT_CLASS_CACHE_MAX = 500

const statementClassCache = new Map<string, CachedStatementClass>()

export const clearStatementClassCache = () => {
  statementClassCache.clear()
}

const cacheStatementClass = (key: string, value: CachedStatementClass) => {
  if (statementClassCache.size >= STATEMENT_CLASS_CACHE_MAX) {
    const oldest = statementClassCache.keys().next().value
    if (oldest !== undefined) statementClassCache.delete(oldest)
  }
  statementClassCache.set(key, value)
}

export const classifyStatements = async (
  sql: string,
  validate: (sql: string) => Promise<ValidateQueryResult>,
): Promise<ClassifiedStatement[]> => {
  const statements = getQueriesFromText(sql)
  if (statements.length === 0) return []
  const results = await Promise.all(
    statements.map(async (stmt): Promise<ClassifiedStatement> => {
      const key = normalizeQueryText(stmt)
      const cached = statementClassCache.get(key)
      if (cached) return { sql: stmt, ...cached }
      const result = await validate(stmt)
      if ("error" in result) {
        return {
          sql: stmt,
          klass: "ERROR",
          error: result.error,
          errorPosition: result.position,
        }
      }
      if (isDqlResult(result)) {
        cacheStatementClass(key, { klass: "DQL" })
        return { sql: stmt, klass: "DQL" }
      }
      cacheStatementClass(key, {
        klass: "DDL_DML",
        queryType: result.queryType,
      })
      return { sql: stmt, klass: "DDL_DML", queryType: result.queryType }
    }),
  )
  return results
}

export const hasWriteStatement = (stmts: ClassifiedStatement[]): boolean =>
  stmts.some((s) => s.klass === "DDL_DML")

// Barrier-bound run gating: the runner's pre-launch classification is the
// single decision for permission enforcement, auto-run eligibility, and
// strategy — dispatch never classifies separately.
export type RunCellGate =
  | { kind: "explicit"; permissions: Permissions }
  | { kind: "autoRun" }

export const checkStatementsForRunQuery = (
  stmts: ClassifiedStatement[],
  perms: Permissions,
): PermissionDecision => {
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

export const checkStatementsForExecution = (
  stmts: ClassifiedStatement[],
  perms: Permissions,
): PermissionDecision => {
  const writeStmt = stmts.find((s) => s.klass === "DDL_DML")
  if (writeStmt && !perms.write) {
    return {
      granted: false,
      reason: denyReasonForWriteSql(writeStmt.queryType ?? "write"),
    }
  }
  return { granted: true }
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
  return checkStatementsForRunQuery(stmts, perms)
}

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
  return checkStatementsForExecution(stmts, perms)
}

export type AutoRunDecision =
  | { action: "run" }
  | { action: "deny"; reason: string }
  | { action: "skip"; reason: string }

const skipReasonForWrite = (queryType: string): string =>
  `AUTO_RUN_SKIPPED: this cell contains a '${queryType}' (write) statement, ` +
  "so it was NOT executed — agent flows never auto-run DDL/DML. " +
  "Confirm with the user, then call run_cell explicitly."

export const checkStatementsForAutoRun = (
  stmts: ClassifiedStatement[],
): AutoRunDecision => {
  const writeStmt = stmts.find((s) => s.klass === "DDL_DML")
  if (!writeStmt) return { action: "run" }
  return {
    action: "skip",
    reason: skipReasonForWrite(writeStmt.queryType ?? "write"),
  }
}

export type RunBarrierOutcome =
  | { action: "proceed"; classified: ClassifiedStatement[] | null }
  | { action: "denied"; reason: string }
  | { action: "skipped"; reason: string }

// The runner's pre-launch barrier, shared by the live and headless paths: one
// classification per launch decides permission enforcement, auto-run
// eligibility, and strategy. A plain single-statement run skips it — there is
// no strategy to pick and the server enforces validity itself. Classification
// failure fails closed exactly when the gate could not otherwise stop a
// write: autoRun always, explicit only without the write permission.
export const resolveRunBarrier = async (
  queryText: string,
  statementCount: number,
  gate: RunCellGate | undefined,
  validate: (stmt: string) => Promise<ValidateQueryResult>,
): Promise<RunBarrierOutcome> => {
  if (gate === undefined && statementCount <= 1) {
    return { action: "proceed", classified: null }
  }
  let classified: ClassifiedStatement[]
  try {
    classified = await classifyStatements(queryText, validate)
  } catch (err) {
    const message = err instanceof Error ? err.message : "validate failed"
    const failClosed =
      gate?.kind === "autoRun" ||
      (gate?.kind === "explicit" && !gate.permissions.write)
    if (failClosed) {
      return {
        action: "denied",
        reason: denyReasonFailClosedClassify("execution", message),
      }
    }
    return { action: "proceed", classified: null }
  }
  if (gate?.kind === "explicit") {
    const decision = checkStatementsForExecution(classified, gate.permissions)
    if (!decision.granted) {
      return { action: "denied", reason: decision.reason }
    }
  }
  if (gate?.kind === "autoRun") {
    const decision = checkStatementsForAutoRun(classified)
    if (decision.action === "skip") {
      return { action: "skipped", reason: decision.reason }
    }
  }
  return { action: "proceed", classified }
}

export const classifyAndCheckSqlForAutoRun = async (
  sql: string,
  validate: (sql: string) => Promise<ValidateQueryResult>,
): Promise<AutoRunDecision> => {
  let stmts: ClassifiedStatement[]
  try {
    stmts = await classifyStatements(sql, validate)
  } catch (err) {
    const message = err instanceof Error ? err.message : "validate failed"
    return {
      action: "deny",
      reason: denyReasonFailClosedClassify("execution", message),
    }
  }
  return checkStatementsForAutoRun(stmts)
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
