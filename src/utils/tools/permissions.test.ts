import { describe, it, expect, vi } from "vitest"
import {
  DEFAULT_DENIED,
  DEFAULT_GRANTED,
  checkToolPermission,
  classifyAndCheckSqlForExecution,
  classifyAndCheckSqlForRunQuery,
  classifyStatements,
  requireAllDQL,
  runPermissionGate,
  togglePermission,
  type Permissions,
  type ToolCategory,
} from "./permissions"
import type { ValidateQueryResult } from "../questdb/types"

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

describe("togglePermission cascade (write ⇒ read ⇒ grantSchemaAccess)", () => {
  it("enabling write also enables read AND grantSchemaAccess", () => {
    expect(togglePermission(ALL_OFF, "write", true)).toEqual(ALL_ON)
    expect(togglePermission(SCHEMA_ONLY, "write", true)).toEqual(ALL_ON)
    expect(togglePermission(READ_ONLY, "write", true)).toEqual(ALL_ON)
  })

  it("enabling read also enables grantSchemaAccess (leaves write alone)", () => {
    expect(togglePermission(ALL_OFF, "read", true)).toEqual(READ_ONLY)
    expect(togglePermission(SCHEMA_ONLY, "read", true)).toEqual(READ_ONLY)
    expect(togglePermission(ALL_ON, "read", true)).toEqual(ALL_ON)
  })

  it("enabling grantSchemaAccess leaves read/write alone", () => {
    expect(togglePermission(ALL_OFF, "grantSchemaAccess", true)).toEqual(
      SCHEMA_ONLY,
    )
    expect(togglePermission(READ_ONLY, "grantSchemaAccess", true)).toEqual(
      READ_ONLY,
    )
  })

  it("disabling grantSchemaAccess also disables read AND write", () => {
    expect(togglePermission(ALL_ON, "grantSchemaAccess", false)).toEqual(
      ALL_OFF,
    )
    expect(togglePermission(READ_ONLY, "grantSchemaAccess", false)).toEqual(
      ALL_OFF,
    )
  })

  it("disabling read also disables write", () => {
    expect(togglePermission(ALL_ON, "read", false)).toEqual(SCHEMA_ONLY)
    expect(togglePermission(READ_ONLY, "read", false)).toEqual(SCHEMA_ONLY)
  })

  it("disabling write leaves read and grantSchemaAccess alone", () => {
    expect(togglePermission(ALL_ON, "write", false)).toEqual(READ_ONLY)
    expect(togglePermission(READ_ONLY, "write", false)).toEqual(READ_ONLY)
  })

  it("default constants", () => {
    expect(DEFAULT_GRANTED).toEqual(ALL_ON)
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

  it("classifies syntax errors as ERROR", async () => {
    const validate = vi.fn().mockResolvedValue(errorValidate)
    const out = await classifyStatements("BAD", validate)
    expect(out).toEqual([{ sql: "BAD", klass: "ERROR" }])
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
  it("DQL without read or write → granted (no data leaves the browser)", async () => {
    const validate = vi.fn().mockResolvedValue(dqlValidate("SELECT 1"))
    expect(
      await classifyAndCheckSqlForExecution("SELECT 1", ALL_OFF, validate),
    ).toEqual({ granted: true })
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
