import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  DEFAULT_DENIED,
  DEFAULT_GRANTED,
  checkStatementsForAutoRun,
  checkStatementsForExecution,
  checkStatementsForRunQuery,
  checkToolPermission,
  classifyAndCheckSqlForAutoRun,
  classifyAndCheckSqlForExecution,
  classifyAndCheckSqlForRunQuery,
  classifyStatements,
  clearStatementClassCache,
  normalizePermissions,
  requireAllDQL,
  resolveRunBarrier,
  runPermissionGate,
  type ClassifiedStatement,
  type Permissions,
  type ToolCategory,
} from "./permissions"
import type { ValidateQueryResult } from "../questdb/types"

beforeEach(() => {
  clearStatementClassCache()
})

// Three-scope state fixtures. Cascade: write ⇒ read ⇒ grantSchemaAccess.
const ALL_OFF: Permissions = {
  grantSchemaAccess: false,
  read: false,
  write: false,
}
const SCHEMA_ONLY: Permissions = {
  grantSchemaAccess: true,
  read: false,
  write: false,
}
const READ_ONLY: Permissions = {
  grantSchemaAccess: true,
  read: true,
  write: false,
}
const ALL_ON: Permissions = {
  grantSchemaAccess: true,
  read: true,
  write: true,
}

const TEST_CATEGORY_MAP: Record<string, ToolCategory> = {
  get_tables: "schema",
  get_table_schema: "schema",
  get_table_details: "schema",
  run_query: "sql",
  run_cell: "sql",
}
const testCategoryFor = (name: string): ToolCategory =>
  TEST_CATEGORY_MAP[name] ?? "free"

describe("normalizePermissions cascade (write ⇒ read ⇒ grantSchemaAccess)", () => {
  it("write:true cascades to all true", () => {
    // Given a permissions object with write enabled
    // When normalized
    // Then read and grantSchemaAccess are forced on
    expect(normalizePermissions(ALL_ON)).toEqual(ALL_ON)
  })

  it("read:true (write:false) keeps write off but forces schema on", () => {
    // Given read enabled without write
    // When normalized
    // Then grantSchemaAccess is forced on and write stays off
    expect(normalizePermissions(READ_ONLY)).toEqual(READ_ONLY)
  })

  it("only grantSchemaAccess:true is left unchanged (read/write stay false)", () => {
    // Given schema access alone
    // When normalized
    // Then nothing cascades up; read and write stay off
    expect(normalizePermissions(SCHEMA_ONLY)).toEqual(SCHEMA_ONLY)
  })

  it("all false stays all false", () => {
    // Given every scope denied
    // When normalized
    // Then the object is unchanged
    expect(normalizePermissions(ALL_OFF)).toEqual(ALL_OFF)
  })

  it("impossible triple read:true with schema:false cascades up", () => {
    // Given a hand-edited triple where read is on but schema was left off
    const handEdited: Permissions = {
      grantSchemaAccess: false,
      read: true,
      write: false,
    }
    // When normalized
    // Then schema is forced on and write stays off
    expect(normalizePermissions(handEdited)).toEqual(READ_ONLY)
  })

  it("impossible triple write:true with read/schema:false cascades to all true", () => {
    // Given a hand-edited triple where write is on but read/schema were left off
    const handEdited: Permissions = {
      grantSchemaAccess: false,
      read: false,
      write: true,
    }
    // When normalized
    // Then every scope is forced on
    expect(normalizePermissions(handEdited)).toEqual(ALL_ON)
  })

  it("default constants match the cascade invariant", () => {
    // Given the exported defaults
    // When compared against the canonical fixtures
    // Then they hold the cascade invariant
    expect(DEFAULT_GRANTED).toEqual(READ_ONLY)
    expect(DEFAULT_DENIED).toEqual(ALL_OFF)
  })
})

describe("checkToolPermission(name, category, perms)", () => {
  it("free tools are granted regardless of permissions", () => {
    for (const perms of [ALL_OFF, SCHEMA_ONLY, READ_ONLY, ALL_ON]) {
      expect(
        checkToolPermission("apply_notebook_state", "free", perms),
      ).toEqual({
        granted: true,
      })
      expect(checkToolPermission("validate_query", "free", perms)).toEqual({
        granted: true,
      })
    }
  })

  it("schema tools require grantSchemaAccess", () => {
    expect(checkToolPermission("get_tables", "schema", ALL_OFF).granted).toBe(
      false,
    )
    expect(checkToolPermission("get_tables", "schema", SCHEMA_ONLY)).toEqual({
      granted: true,
    })
    expect(checkToolPermission("get_tables", "schema", READ_ONLY)).toEqual({
      granted: true,
    })
    expect(checkToolPermission("get_tables", "schema", ALL_ON)).toEqual({
      granted: true,
    })
  })

  it("schema denial reason names the missing scope", () => {
    const decision = checkToolPermission("get_tables", "schema", ALL_OFF)
    if (decision.granted) throw new Error("expected deny")
    expect(decision.reason).toMatch(/PERMISSION_DENIED/)
    expect(decision.reason).toMatch(/get_tables/)
    expect(decision.reason).toMatch(/'grantSchemaAccess'/)
  })

  it("sql-category tools fail closed under checkToolPermission — caller must use the SQL helpers", () => {
    const decision = checkToolPermission("run_query", "sql", ALL_ON)
    expect(decision.granted).toBe(false)
  })
})

const dqlValidate = (sql = "SELECT 1"): ValidateQueryResult => ({
  query: sql,
  columns: [{ name: "c1", type: "LONG" }],
  timestamp: -1,
})
const ddlValidate: ValidateQueryResult = { queryType: "CREATE TABLE" }
const dmlValidate: ValidateQueryResult = { queryType: "INSERT" }
const errorValidate: ValidateQueryResult = {
  query: "BAD",
  position: 0,
  error: "syntax",
}

const validatorFor = (
  map: Record<string, ValidateQueryResult>,
): ((sql: string) => Promise<ValidateQueryResult>) => {
  return (sql) => {
    const trimmed = sql.trim()
    const hit = map[trimmed]
    return Promise.resolve(hit ?? dqlValidate(trimmed))
  }
}

describe("classifyStatements", () => {
  it("returns [] for empty input", async () => {
    const validate = vi.fn()
    expect(await classifyStatements("   \n", validate)).toEqual([])
    expect(validate).not.toHaveBeenCalled()
  })

  it("classifies a single DQL statement as DQL", async () => {
    const validate = vi.fn().mockResolvedValue(dqlValidate("SELECT 1"))
    const out = await classifyStatements("SELECT 1", validate)
    expect(out).toEqual([{ sql: "SELECT 1", klass: "DQL" }])
  })

  it("classifies a single DDL statement as DDL_DML with queryType", async () => {
    const validate = vi.fn().mockResolvedValue(ddlValidate)
    const out = await classifyStatements("CREATE TABLE t (a INT)", validate)
    expect(out).toEqual([
      {
        sql: "CREATE TABLE t (a INT)",
        klass: "DDL_DML",
        queryType: "CREATE TABLE",
      },
    ])
  })

  it("classifies syntax errors as ERROR and retains the server message", async () => {
    const validate = vi.fn().mockResolvedValue(errorValidate)
    const out = await classifyStatements("BAD", validate)
    expect(out).toEqual([
      { sql: "BAD", klass: "ERROR", error: "syntax", errorPosition: 0 },
    ])
  })

  it("splits and classifies each statement of a multi-statement cell", async () => {
    const validate = validatorFor({
      "DROP TABLE x": ddlValidate,
      "SELECT 1": dqlValidate("SELECT 1"),
      "INSERT INTO t VALUES (1)": dmlValidate,
    })
    const out = await classifyStatements(
      "DROP TABLE x; SELECT 1; INSERT INTO t VALUES (1)",
      validate,
    )
    expect(out).toEqual([
      { sql: "DROP TABLE x", klass: "DDL_DML", queryType: "CREATE TABLE" },
      { sql: "SELECT 1", klass: "DQL" },
      {
        sql: "INSERT INTO t VALUES (1)",
        klass: "DDL_DML",
        queryType: "INSERT",
      },
    ])
  })

  it("propagates validate failures (callers fail closed)", async () => {
    const validate = vi.fn().mockRejectedValue(new Error("network down"))
    await expect(classifyStatements("SELECT 1", validate)).rejects.toThrow(
      /network down/,
    )
  })
})

describe("statement class cache", () => {
  it("caches DQL and DDL_DML classes by statement text", async () => {
    // Given a mixed cell classified once
    const validate = vi.fn(
      validatorFor({
        "SELECT 1": dqlValidate("SELECT 1"),
        "INSERT INTO t VALUES (1)": dmlValidate,
      }),
    )
    await classifyStatements("SELECT 1; INSERT INTO t VALUES (1)", validate)
    expect(validate).toHaveBeenCalledTimes(2)

    // When the same statements are classified again
    const out = await classifyStatements(
      "SELECT 1; INSERT INTO t VALUES (1)",
      validate,
    )

    // Then no new validate requests are made and classes are preserved
    expect(validate).toHaveBeenCalledTimes(2)
    expect(out).toEqual([
      { sql: "SELECT 1", klass: "DQL" },
      {
        sql: "INSERT INTO t VALUES (1)",
        klass: "DDL_DML",
        queryType: "INSERT",
      },
    ])
  })

  it("hits the cache across whitespace and trailing-semicolon variants", async () => {
    // Given a statement classified once
    const validate = vi.fn().mockResolvedValue(dqlValidate("SELECT 1"))
    await classifyStatements("SELECT 1", validate)

    // When the same statement is classified with a trailing semicolon
    const out = await classifyStatements("  SELECT 1;  ", validate)

    // Then the cached class is reused
    expect(validate).toHaveBeenCalledTimes(1)
    expect(out[0].klass).toBe("DQL")
  })

  it("never caches ERROR — an invalid statement is revalidated every time", async () => {
    // Given a statement that fails validation, then validates as DML
    const validate = vi
      .fn()
      .mockResolvedValueOnce(errorValidate)
      .mockResolvedValueOnce(dmlValidate)
    await classifyStatements("BAD", validate)

    // When it is classified again after the schema changed
    const out = await classifyStatements("BAD", validate)

    // Then the fresh class wins
    expect(validate).toHaveBeenCalledTimes(2)
    expect(out).toEqual([{ sql: "BAD", klass: "DDL_DML", queryType: "INSERT" }])
  })

  it("a transport failure caches nothing", async () => {
    // Given a validate call that fails at the transport level
    const validate = vi.fn().mockRejectedValueOnce(new Error("network down"))
    await expect(classifyStatements("SELECT 1", validate)).rejects.toThrow()

    // When classification is retried after connectivity returns
    validate.mockResolvedValueOnce(dqlValidate("SELECT 1"))
    const out = await classifyStatements("SELECT 1", validate)

    // Then the statement is validated again
    expect(validate).toHaveBeenCalledTimes(2)
    expect(out[0].klass).toBe("DQL")
  })
})

describe("checkStatements* (pre-classified barrier variants)", () => {
  const dqlStmt: ClassifiedStatement = { sql: "SELECT 1", klass: "DQL" }
  const writeStmt: ClassifiedStatement = {
    sql: "INSERT INTO t VALUES (1)",
    klass: "DDL_DML",
    queryType: "INSERT",
  }
  const errorStmt: ClassifiedStatement = {
    sql: "BAD",
    klass: "ERROR",
    error: "syntax",
  }

  it("execution: write statement without write permission → denied", () => {
    const decision = checkStatementsForExecution(
      [dqlStmt, writeStmt],
      READ_ONLY,
    )
    if (decision.granted) throw new Error("expected deny")
    expect(decision.reason).toMatch(/INSERT/)
  })

  it("execution: invalid statements never demote the cell — DQL + ERROR is granted", () => {
    expect(
      checkStatementsForExecution([dqlStmt, errorStmt], READ_ONLY),
    ).toEqual({ granted: true })
  })

  it("run_query: DQL without read → denied for read", () => {
    const decision = checkStatementsForRunQuery([dqlStmt], SCHEMA_ONLY)
    expect(decision.granted).toBe(false)
  })

  it("auto-run: write statement → skip; DQL + ERROR → run", () => {
    expect(checkStatementsForAutoRun([dqlStmt, writeStmt]).action).toBe("skip")
    expect(checkStatementsForAutoRun([dqlStmt, errorStmt])).toEqual({
      action: "run",
    })
  })
})

describe("resolveRunBarrier — the runner's pre-launch gate", () => {
  it("skips classification for an ungated single statement", async () => {
    // Given a plain UI run of one statement
    const validate = vi.fn()

    // When the barrier resolves
    const out = await resolveRunBarrier("SELECT 1", 1, undefined, validate)

    // Then no validate round trip happens and the run proceeds unclassified
    expect(validate).not.toHaveBeenCalled()
    expect(out).toEqual({ action: "proceed", classified: null })
  })

  it("classifies an ungated multi-statement cell for strategy", async () => {
    // Given an ungated script of two reads
    const validate = vi.fn(validatorFor({}))

    // When the barrier resolves
    const out = await resolveRunBarrier(
      "SELECT 1; SELECT 2",
      2,
      undefined,
      validate,
    )

    // Then every statement is classified so the runner can pick parallel
    expect(out.action).toBe("proceed")
    if (out.action === "proceed") {
      expect(out.classified?.map((s) => s.klass)).toEqual(["DQL", "DQL"])
    }
  })

  it("explicit gate: denies a write without the write permission", async () => {
    // Given an agent-run cell containing an INSERT under read-only perms
    const validate = vi.fn(
      validatorFor({ "INSERT INTO t VALUES (1)": dmlValidate }),
    )

    // When the barrier resolves
    const out = await resolveRunBarrier(
      "INSERT INTO t VALUES (1)",
      1,
      { kind: "explicit", permissions: READ_ONLY },
      validate,
    )

    // Then the run is denied before anything executes
    expect(out.action).toBe("denied")
    if (out.action === "denied") expect(out.reason).toMatch(/INSERT/)
  })

  it("explicit gate: grants a write with the write permission", async () => {
    // Given the same INSERT with write granted
    const validate = vi.fn(
      validatorFor({ "INSERT INTO t VALUES (1)": dmlValidate }),
    )

    // When the barrier resolves
    const out = await resolveRunBarrier(
      "INSERT INTO t VALUES (1)",
      1,
      { kind: "explicit", permissions: ALL_ON },
      validate,
    )

    // Then the run proceeds with the classification attached
    expect(out.action).toBe("proceed")
    if (out.action === "proceed") {
      expect(out.classified?.[0].klass).toBe("DDL_DML")
    }
  })

  it("autoRun gate: skips a write cell — agent flows never auto-run DDL/DML", async () => {
    // Given an auto-run of a DML cell
    const validate = vi.fn(
      validatorFor({ "INSERT INTO t VALUES (1)": dmlValidate }),
    )

    // When the barrier resolves
    const out = await resolveRunBarrier(
      "INSERT INTO t VALUES (1)",
      1,
      { kind: "autoRun" },
      validate,
    )

    // Then the cell is skipped, never executed
    expect(out.action).toBe("skipped")
    if (out.action === "skipped") expect(out.reason).toMatch(/AUTO_RUN_SKIPPED/)
  })

  it("autoRun gate: an invalid statement never demotes the cell", async () => {
    // Given a read cell whose second statement fails validation
    const validate = vi.fn(validatorFor({ BAD: errorValidate }))

    // When the barrier resolves
    const out = await resolveRunBarrier(
      "SELECT 1; BAD",
      2,
      { kind: "autoRun" },
      validate,
    )

    // Then the run proceeds — the invalid slot carries its error instead
    expect(out.action).toBe("proceed")
  })

  it("fails closed when classification is unreachable under autoRun", async () => {
    // Given a validate transport that is down
    const validate = vi.fn().mockRejectedValue(new Error("network down"))

    // When an auto-run reaches the barrier
    const out = await resolveRunBarrier(
      "SELECT 1",
      1,
      { kind: "autoRun" },
      validate,
    )

    // Then the run is denied — an unclassifiable cell could hide a write
    expect(out.action).toBe("denied")
    if (out.action === "denied")
      expect(out.reason).toMatch(/could not classify/)
  })

  it("fails closed when explicit-without-write cannot classify", async () => {
    const validate = vi.fn().mockRejectedValue(new Error("network down"))

    const out = await resolveRunBarrier(
      "SELECT 1",
      1,
      { kind: "explicit", permissions: READ_ONLY },
      validate,
    )

    expect(out.action).toBe("denied")
  })

  it("falls open to the unclassified path when explicit-with-write cannot classify", async () => {
    // Given write permission — the gate could not be used to smuggle a write
    const validate = vi.fn().mockRejectedValue(new Error("network down"))

    // When the barrier resolves
    const out = await resolveRunBarrier(
      "SELECT 1",
      1,
      { kind: "explicit", permissions: ALL_ON },
      validate,
    )

    // Then the run proceeds without a classification (sequential strategy)
    expect(out).toEqual({ action: "proceed", classified: null })
  })

  it("falls open when an ungated multi-statement cell cannot classify", async () => {
    // Given a plain UI script run with validation unreachable
    const validate = vi.fn().mockRejectedValue(new Error("network down"))

    // When the barrier resolves
    const out = await resolveRunBarrier(
      "SELECT 1; SELECT 2",
      2,
      undefined,
      validate,
    )

    // Then the user's run still proceeds on the sequential path
    expect(out).toEqual({ action: "proceed", classified: null })
  })
})

describe("classifyAndCheckSqlForRunQuery", () => {
  it("denies empty SQL without calling validate", async () => {
    const validate = vi.fn()
    const decision = await classifyAndCheckSqlForRunQuery(
      "  ",
      ALL_ON,
      validate,
    )
    expect(decision.granted).toBe(false)
    expect(validate).not.toHaveBeenCalled()
  })

  it("DQL with read but no write → granted", async () => {
    const validate = vi.fn().mockResolvedValue(dqlValidate("SELECT 1"))
    expect(
      await classifyAndCheckSqlForRunQuery("SELECT 1", READ_ONLY, validate),
    ).toEqual({ granted: true })
  })

  it("DQL with neither read nor write → denied for read", async () => {
    const validate = vi.fn().mockResolvedValue(dqlValidate("SELECT 1"))
    const decision = await classifyAndCheckSqlForRunQuery(
      "SELECT 1",
      SCHEMA_ONLY,
      validate,
    )
    if (decision.granted) throw new Error("expected deny")
    expect(decision.reason).toMatch(/'read' permission/)
  })

  it("DDL without write → denied; reason names the queryType", async () => {
    const validate = vi.fn().mockResolvedValue(ddlValidate)
    const decision = await classifyAndCheckSqlForRunQuery(
      "CREATE TABLE t (a INT)",
      READ_ONLY,
      validate,
    )
    if (decision.granted) throw new Error("expected deny")
    expect(decision.reason).toMatch(/CREATE TABLE/)
    expect(decision.reason).toMatch(/'write' permission/)
  })

  it("DDL with write → granted", async () => {
    const validate = vi.fn().mockResolvedValue(ddlValidate)
    expect(
      await classifyAndCheckSqlForRunQuery(
        "CREATE TABLE t (a INT)",
        ALL_ON,
        validate,
      ),
    ).toEqual({ granted: true })
  })

  it("multi-statement mixed (DDL + DQL) → denies on DDL when no write", async () => {
    const validate = validatorFor({
      "DROP TABLE x": ddlValidate,
      "SELECT 1": dqlValidate("SELECT 1"),
    })
    const decision = await classifyAndCheckSqlForRunQuery(
      "DROP TABLE x; SELECT 1",
      READ_ONLY,
      validate,
    )
    expect(decision.granted).toBe(false)
  })

  it("validate failure → fail-closed deny", async () => {
    const validate = vi.fn().mockRejectedValue(new Error("network down"))
    const decision = await classifyAndCheckSqlForRunQuery(
      "SELECT 1",
      READ_ONLY,
      validate,
    )
    if (decision.granted) throw new Error("expected deny")
    expect(decision.reason).toMatch(/network down/)
  })
})

describe("classifyAndCheckSqlForExecution", () => {
  it("DQL is granted at every level — no rows return to the agent, results stay in the console", async () => {
    const validate = vi.fn().mockResolvedValue(dqlValidate("SELECT 1"))
    for (const perms of [ALL_OFF, SCHEMA_ONLY, READ_ONLY, ALL_ON]) {
      expect(
        await classifyAndCheckSqlForExecution("SELECT 1", perms, validate),
      ).toEqual({ granted: true })
    }
  })

  it("DDL without write → denied", async () => {
    const validate = vi.fn().mockResolvedValue(ddlValidate)
    const decision = await classifyAndCheckSqlForExecution(
      "CREATE TABLE t (a INT)",
      READ_ONLY,
      validate,
    )
    if (decision.granted) throw new Error("expected deny")
    expect(decision.reason).toMatch(/'write' permission/)
  })

  it("DML without write → denied", async () => {
    const validate = vi.fn().mockResolvedValue(dmlValidate)
    const decision = await classifyAndCheckSqlForExecution(
      "INSERT INTO t VALUES (1)",
      READ_ONLY,
      validate,
    )
    expect(decision.granted).toBe(false)
  })

  it("DDL with write → granted", async () => {
    const validate = vi.fn().mockResolvedValue(ddlValidate)
    expect(
      await classifyAndCheckSqlForExecution(
        "CREATE TABLE t (a INT)",
        ALL_ON,
        validate,
      ),
    ).toEqual({ granted: true })
  })

  it("multi-statement mixed (DDL + DQL) → denies on DDL when no write", async () => {
    const validate = validatorFor({
      "DROP TABLE x": ddlValidate,
      "SELECT 1": dqlValidate("SELECT 1"),
    })
    const decision = await classifyAndCheckSqlForExecution(
      "DROP TABLE x; SELECT 1",
      READ_ONLY,
      validate,
    )
    expect(decision.granted).toBe(false)
  })

  it("validate failure → fail-closed deny", async () => {
    const validate = vi.fn().mockRejectedValue(new Error("network down"))
    const decision = await classifyAndCheckSqlForExecution(
      "SELECT 1",
      ALL_OFF,
      validate,
    )
    if (decision.granted) throw new Error("expected deny")
    expect(decision.reason).toMatch(/network down/)
  })
})

describe("classifyAndCheckSqlForAutoRun (apply_notebook_state / add_cell)", () => {
  it("DQL → run", async () => {
    const validate = vi.fn().mockResolvedValue(dqlValidate("SELECT 1"))
    expect(await classifyAndCheckSqlForAutoRun("SELECT 1", validate)).toEqual({
      action: "run",
    })
  })

  it("DML → skip, points at run_cell (writes never auto-run)", async () => {
    const validate = vi.fn().mockResolvedValue(dmlValidate)
    const decision = await classifyAndCheckSqlForAutoRun(
      "INSERT INTO t VALUES (1)",
      validate,
    )
    if (decision.action !== "skip") throw new Error("expected skip")
    expect(decision.reason).toMatch(/AUTO_RUN_SKIPPED/)
    expect(decision.reason).toMatch(/run_cell/)
  })

  it("mixed DQL + DML cell → skip (statement-level, not cell typing)", async () => {
    const validate = validatorFor({
      "SELECT 1": dqlValidate("SELECT 1"),
      "INSERT INTO t VALUES (1)": dmlValidate,
    })
    const decision = await classifyAndCheckSqlForAutoRun(
      "SELECT 1; INSERT INTO t VALUES (1)",
      validate,
    )
    expect(decision.action).toBe("skip")
  })

  it("validate failure → fail-closed deny", async () => {
    const validate = vi.fn().mockRejectedValue(new Error("network down"))
    const decision = await classifyAndCheckSqlForAutoRun("SELECT 1", validate)
    if (decision.action !== "deny") throw new Error("expected deny")
    expect(decision.reason).toMatch(/network down/)
  })
})

describe("requireAllDQL (draw invariant)", () => {
  it("empty cell allowed", async () => {
    const validate = vi.fn()
    expect(await requireAllDQL("   \n", validate)).toEqual({ granted: true })
    expect(validate).not.toHaveBeenCalled()
  })

  it("single DQL allowed", async () => {
    const validate = vi.fn().mockResolvedValue(dqlValidate("SELECT 1"))
    expect(await requireAllDQL("SELECT 1", validate)).toEqual({ granted: true })
  })

  it("single DDL denied regardless of permissions", async () => {
    const validate = vi.fn().mockResolvedValue(ddlValidate)
    const decision = await requireAllDQL("DROP TABLE x", validate)
    if (decision.granted) throw new Error("expected deny")
    expect(decision.reason).toMatch(/Cannot draw a write query/)
    expect(decision.reason).toMatch(/CREATE TABLE/)
  })

  it("multi-statement with mixed DQL and DDL is denied", async () => {
    const validate = validatorFor({
      "SELECT 1": dqlValidate("SELECT 1"),
      "DROP TABLE x": ddlValidate,
    })
    const decision = await requireAllDQL("SELECT 1; DROP TABLE x", validate)
    expect(decision.granted).toBe(false)
  })

  it("statement with syntax error passes through (executor surfaces it)", async () => {
    const validate = vi.fn().mockResolvedValue(errorValidate)
    expect(await requireAllDQL("BAD", validate)).toEqual({ granted: true })
  })

  it("validate failure → fail-closed deny", async () => {
    const validate = vi.fn().mockRejectedValue(new Error("network down"))
    const decision = await requireAllDQL("SELECT 1", validate)
    if (decision.granted) throw new Error("expected deny")
    expect(decision.reason).toMatch(/Cannot classify cell SQL/)
  })
})

describe("runPermissionGate", () => {
  it("free tool short-circuits to granted", () => {
    const decision = runPermissionGate("create_notebook", {
      permissions: ALL_OFF,
      categoryFor: testCategoryFor,
    })
    expect(decision).toEqual({ granted: true })
  })

  it("schema tool denied without grantSchemaAccess", () => {
    const decision = runPermissionGate("get_tables", {
      permissions: ALL_OFF,
      categoryFor: testCategoryFor,
    })
    expect(decision.granted).toBe(false)
  })

  it("schema tool granted with grantSchemaAccess only", () => {
    const decision = runPermissionGate("get_tables", {
      permissions: SCHEMA_ONLY,
      categoryFor: testCategoryFor,
    })
    expect(decision).toEqual({ granted: true })
  })

  it("sql-category tools pass the gate (their case bodies apply the SQL helpers)", () => {
    const decision = runPermissionGate("run_query", {
      permissions: ALL_OFF,
      categoryFor: testCategoryFor,
    })
    expect(decision).toEqual({ granted: true })
  })
})
