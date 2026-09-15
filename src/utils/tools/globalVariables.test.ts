import "../../test/stubBrowserGlobals"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { liveQuery } from "dexie"
import { db } from "../../store/db"
import {
  getNotebookGlobals,
  saveNotebookGlobals,
} from "../../store/notebookGlobals"
import {
  GLOBAL_OPTIONS_OWNER,
  loadStoredOptions,
  saveStoredOptions,
} from "../../store/notebookOptions"
import type { NotebookVariable } from "../../store/notebook"
import {
  __resetNotebookAIBridgeForTests,
  registerNotebookAgentDeps,
} from "../notebooks/notebookAIBridge"
import type { Client } from "../questdb/client"
import type { ModelToolsClient } from "../ai/aiAssistant"
import type { ValidateQueryResult } from "../questdb/types"
import { dispatchTool } from "./dispatch"
import { ALL_DEFINITIONS, toolsForPermission } from "./tools"
import { DEFAULT_GRANTED } from "./permissions"
import { storedVariableToWire } from "./variablesWire"
import { resolveHeadlessDeclareEntries } from "../notebooks/notebookVariableOptions"

const expression = (name: string, value: string): NotebookVariable => ({
  name,
  kind: "expression",
  value,
})
const queryList = (name: string, query: string): NotebookVariable => ({
  name,
  kind: "list",
  source: { type: "query", query, refresh: "onLoad" },
  sort: "none",
  multi: true,
  includeAll: true,
  all: { mode: "list" },
  selected: "all",
})
const valid = (query: string): ValidateQueryResult => ({
  query,
  columns: [{ name: "n", type: "INT" }],
  timestamp: -1,
})
const validate = vi.fn(
  (sql: string): Promise<ValidateQueryResult> =>
    Promise.resolve(
      sql.includes("@missing")
        ? { query: sql, error: "undeclared @missing", position: 0 }
        : sql.includes("INSERT")
          ? { query: sql, queryType: "INSERT" }
          : valid(sql),
    ),
)
const queryRaw = vi.fn((_sql: string) => ({
  queryId: "options",
  promise: Promise.resolve({
    type: "dql",
    columns: [{ name: "n", type: "INT" }],
    dataset: [[1]],
    count: 1,
  }),
}))
const invoke = (name: string, input: unknown, signal?: AbortSignal) =>
  dispatchTool(
    name,
    input,
    {} as ModelToolsClient,
    () => undefined,
    DEFAULT_GRANTED,
    validate,
    signal,
  )
const read = async () =>
  JSON.parse((await invoke("get_global_variables", {})).content) as {
    revision: number
    variables: unknown[]
  }
const apply = (
  variables: NotebookVariable[] | null,
  revision: number | null,
  signal?: AbortSignal,
) =>
  invoke(
    "apply_global_variables",
    {
      variables: variables?.map(storedVariableToWire) ?? null,
      expected_revision: revision,
      time_range: null,
    },
    signal,
  )

beforeEach(async () => {
  __resetNotebookAIBridgeForTests()
  await db.notebook_globals.clear()
  await db.notebook_options.clear()
  await db.buffers.clear()
  validate.mockClear()
  queryRaw.mockClear()
  registerNotebookAgentDeps({
    getQuest: () =>
      ({
        validateQuery: validate,
        queryRaw,
        abort: () => undefined,
      }) as unknown as Client,
  })
})

describe("global variable tools", () => {
  it("exposes both tools on AI and MCP with no notebook-id gate", () => {
    for (const surface of ["ai", "mcp"] as const) {
      const names = toolsForPermission(DEFAULT_GRANTED, surface).map(
        (t) => t.name,
      )
      expect(names).toContain("get_global_variables")
      expect(names).toContain("apply_global_variables")
    }
    const definition = ALL_DEFINITIONS.find(
      (d) => d.name === "apply_global_variables",
    )
    expect(definition?.inputSchema.properties.buffer_id).toBeUndefined()
    expect(definition?.inputSchema.required).toContain("expected_revision")
  })

  it("reads every global in reusable wire format, including conflicting names in saved notebooks", async () => {
    const list = queryList("g", "SELECT 1")
    await saveNotebookGlobals([list, expression("other", "2")])
    await db.buffers.put({
      id: 1,
      label: "notebook",
      position: 0,
      value: "",
      notebookViewState: {
        cells: [],
        settings: { variables: [expression("g", "42")] },
      },
    })
    const snapshot = await read()
    expect(snapshot.revision).toBe(1)
    expect(snapshot.variables).toEqual([
      storedVariableToWire(list),
      storedVariableToWire(expression("other", "2")),
    ])
    expect(validate).not.toHaveBeenCalled()
    expect(queryRaw).not.toHaveBeenCalled()
  })

  it("rejects a global name used in another notebook before SQL validation", async () => {
    // Given
    await db.buffers.put({
      id: 2,
      label: "Other notebook",
      position: 0,
      value: "",
      notebookViewState: {
        cells: [],
        settings: { variables: [expression("RATE", "2")] },
      },
    })

    // When
    const result = await apply([expression("rate", "5")], 0)

    // Then
    expect(result.is_error).toBe(true)
    expect((JSON.parse(result.content) as { message: string }).message).toBe(
      "Variable rate: This variable is already defined.",
    )
    expect(await getNotebookGlobals()).toBeNull()
    expect(validate).not.toHaveBeenCalled()
  })

  it("rejects repeated global names, ignoring case", async () => {
    // Given
    const variables = [expression("rate", "5"), expression("RATE", "2")]

    // When
    const result = await apply(variables, 0)

    // Then
    expect(result.is_error).toBe(true)
    expect((JSON.parse(result.content) as { message: string }).message).toBe(
      "Variable RATE: This variable is already defined.",
    )
    expect(await getNotebookGlobals()).toBeNull()
    expect(validate).not.toHaveBeenCalled()
  })

  it("preserves with null, creates/updates/deletes with full arrays, and clears with []", async () => {
    expect(
      (await apply([expression("g1", "1"), expression("g2", "2")], 0)).is_error,
    ).toBeFalsy()
    const snapshot = await read()
    const before = await getNotebookGlobals()
    const preserved = JSON.parse((await apply(null, null)).content) as {
      applied: boolean
    }
    expect(preserved.applied).toBe(false)
    expect(await getNotebookGlobals()).toEqual(before)
    expect(
      (
        await apply(
          [expression("g1", "10"), expression("g3", "@g1 + 1")],
          snapshot.revision,
        )
      ).is_error,
    ).toBeFalsy()
    expect((await getNotebookGlobals())?.variables.map((v) => v.name)).toEqual([
      "g1",
      "g3",
    ])
    expect((await apply([], (await read()).revision)).is_error).toBeFalsy()
    expect((await read()).variables).toEqual([])
  })

  it("requires a revision for replacements and rejects stale clears", async () => {
    const missing = await apply([], null)
    expect(missing.is_error).toBe(true)
    expect(missing.content).toContain("state_not_fetched")
    await saveNotebookGlobals([expression("user", "1")])
    const stale = await apply([], 0)
    expect(stale.is_error).toBe(true)
    expect(stale.content).toContain("state_stale")
    expect((await read()).variables).toHaveLength(1)
  })

  it("does not silently clear when the variables field is missing", async () => {
    await saveNotebookGlobals([expression("keep", "1")])
    expect(
      (await invoke("apply_global_variables", { expected_revision: 1 }))
        .is_error,
    ).toBe(true)
    expect((await read()).variables).toHaveLength(1)
  })

  it.each([
    [expression("bad-name", "1")],
    [expression("timeFrom", "1")],
    [expression("g", "1"), expression("g", "2")],
    [expression("g", "1, @injected := 2")],
  ])(
    "rejects invalid definitions before any write or option execution",
    async (...variables) => {
      const before = await getNotebookGlobals()
      const result = await apply(variables, 0)
      expect(result.is_error).toBe(true)
      expect(await getNotebookGlobals()).toEqual(before)
      expect(queryRaw).not.toHaveBeenCalled()
    },
  )

  it("records a non-SELECT list error without executing the query", async () => {
    // Given
    const variables = [queryList("g", "INSERT INTO t VALUES (1)")]
    // When
    const result = await apply(variables, 0)
    // Then
    expect(result.is_error).toBeFalsy()
    expect(
      (
        JSON.parse(result.content) as {
          variable_errors: Record<string, string>
        }
      ).variable_errors.g,
    ).toContain("must be a SELECT")
    expect(queryRaw).not.toHaveBeenCalled()
  })

  it("resolves a cold All list before its dependent expressions and notifies database subscribers", async () => {
    const changes: number[] = []
    const subscription = liveQuery(getNotebookGlobals).subscribe((row) =>
      changes.push(row?.revision ?? 0),
    )
    try {
      await vi.waitFor(() => expect(changes).toContain(0))
      const result = await apply(
        [
          queryList("a", "SELECT 1 AS n"),
          expression("b", "@a + 1"),
          expression("c", "@b + 1"),
        ],
        0,
      )
      expect(result.is_error).toBeFalsy()
      expect(
        validate.mock.calls.some(
          ([sql]) => sql.includes("@a := 1") && sql.includes("@c := @b + 1"),
        ),
      ).toBe(true)
      expect(queryRaw).toHaveBeenCalledTimes(1)
      await vi.waitFor(() => expect(changes).toContain(1))
      expect(
        (await loadStoredOptions(GLOBAL_OPTIONS_OWNER)).map((row) => row.name),
      ).toEqual(["a"])
    } finally {
      subscription.unsubscribe()
    }
  })

  it("commits valid fetched values and reports dependent expression errors", async () => {
    await saveNotebookGlobals([expression("keep", "1")])
    await saveStoredOptions({
      owner: GLOBAL_OPTIONS_OWNER,
      name: "cached",
      options: [{ value: "1", label: "1" }],
      fetchedAt: 1,
    })
    const result = await apply(
      [queryList("a", "SELECT 1 AS n"), expression("b", "@a + @missing")],
      1,
    )
    expect(result.is_error).toBeFalsy()
    const parsed = JSON.parse(result.content) as {
      applied: boolean
      variable_errors: Record<string, string>
    }
    expect(parsed.applied).toBe(true)
    expect(parsed.variable_errors.b).toContain("@missing")
    expect(
      (await getNotebookGlobals())?.variables.map((variable) => variable.name),
    ).toEqual(["a", "b"])
    expect(
      (await loadStoredOptions(GLOBAL_OPTIONS_OWNER)).map((row) => row.name),
    ).toEqual(["a"])
  })

  it("rejects an edit that races validation, including a UI save", async () => {
    const baseline = (await read()).revision
    validate.mockImplementationOnce(async (sql) => {
      await saveNotebookGlobals([expression("user", "42")])
      return valid(sql)
    })
    const result = await apply([expression("agent", "1")], baseline)
    expect(result.is_error).toBe(true)
    expect(result.content).toContain("state_stale")
    expect((await getNotebookGlobals())?.variables.map((v) => v.name)).toEqual([
      "user",
    ])
  })

  it("allows only one simultaneous replacement of the same revision", async () => {
    const results = await Promise.all([
      apply([expression("a", "1")], 0),
      apply([expression("b", "2")], 0),
    ])
    expect(results.filter((r) => !r.is_error)).toHaveLength(1)
    expect(
      results.filter((r) => r.content.includes("state_stale")),
    ).toHaveLength(1)
    expect((await read()).revision).toBe(1)
  })

  it("does not save an aborted validation", async () => {
    const controller = new AbortController()
    validate.mockImplementationOnce((sql) => {
      controller.abort()
      return Promise.resolve(valid(sql))
    })
    expect(
      (await apply([expression("a", "1")], 0, controller.signal)).is_error,
    ).toBe(true)
    expect(await getNotebookGlobals()).toBeNull()
  })

  it("uses a supplied range only for validation without writing a notebook range", async () => {
    const result = await invoke("apply_global_variables", {
      variables: [
        storedVariableToWire(
          queryList("a", "SELECT cast(@timeFrom as string) n"),
        ),
      ],
      expected_revision: 0,
      time_range: { from: "2025-01-01", to: "2025-01-02" },
    })
    expect(result.is_error).toBeFalsy()
    expect(queryRaw.mock.calls[0][0]).toContain("2025-01-01")
    expect(await db.buffers.count()).toBe(0)
  })

  it("invalidates affected global options and headless local dependents observe new globals", async () => {
    const list = queryList("local", "SELECT @g AS n")
    await saveNotebookGlobals([expression("g", "1")])
    const quest = {
      validateQuery: validate,
      queryRaw,
      abort: () => undefined,
    } as unknown as Client
    const resolve = async () =>
      resolveHeadlessDeclareEntries({
        bufferId: 1,
        quest,
        settings: { variables: [list] },
        globals: (await getNotebookGlobals())?.variables ?? [],
        signal: new AbortController().signal,
      })
    await resolve()
    await saveStoredOptions({
      owner: GLOBAL_OPTIONS_OWNER,
      name: "g",
      options: [{ value: "1", label: "1" }],
      fetchedAt: 1,
    })
    expect((await apply([expression("g", "2")], 1)).is_error).toBeFalsy()
    expect(await loadStoredOptions(GLOBAL_OPTIONS_OWNER)).toEqual([])
    await resolve()
    expect(queryRaw).toHaveBeenCalledTimes(2)
    expect(queryRaw.mock.calls[1][0]).toContain("@g := 2")
  })

  it("reads legacy rows at revision zero and advances them on replacement", async () => {
    await db.notebook_globals.put({
      id: "globals",
      variables: [expression("old", "1")],
    })
    expect((await read()).revision).toBe(0)
    expect((await apply([], 0)).is_error).toBeFalsy()
    expect((await read()).revision).toBe(1)
  })
})
