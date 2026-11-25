import "../../test/stubBrowserGlobals"
import { beforeEach, describe, expect, it } from "vitest"
import { db } from "../../store/db"
import type { ListVariable } from "../../store/notebook"
import {
  GLOBAL_OPTIONS_OWNER,
  loadStoredOptions,
  notebookOptionsOwner,
  saveStoredOptions,
} from "../../store/notebookOptions"
import { variableOptionsContext } from "../../scenes/Editor/Notebook/variables/options/fetchVariableOptions"
import type { Client } from "../questdb/client"
import { TIME_VARIABLE_NAMES } from "../../scenes/Editor/Notebook/variables/timeRange"
import type { VariableErrors } from "../../scenes/Editor/Notebook/variables/prepareVariables"
import {
  prepareNotebookVariables,
  resolveHeadlessDeclareEntries,
  type VariableValuesEntry,
} from "./notebookVariableOptions"

const BUFFER_ID = 7

const queryList = (name: string, query: string): ListVariable => ({
  name,
  kind: "list",
  source: { type: "query", query },
  sort: "none",
  multi: true,
  includeAll: true,
  all: { mode: "list" },
  selected: "all",
})

const symbolRows = (values: string[]) => ({
  type: "dql",
  columns: [{ name: "symbol", type: "SYMBOL" }],
  dataset: values.map((value) => [value]),
  count: values.length,
})

const makeQuest = (responses: unknown[]) => {
  const sent: string[] = []
  const quest = {
    validateQuery: () =>
      Promise.resolve({
        query: "",
        columns: [{ name: "symbol", type: "SYMBOL" }],
        timestamp: -1,
      }),
    queryRaw: (sql: string) => {
      sent.push(sql)
      return { promise: Promise.resolve(responses.shift()), queryId: "q" }
    },
    abort: () => undefined,
  } as unknown as Client
  return { quest, sent }
}

const withoutFetchTime = (entry: VariableValuesEntry) =>
  "error" in entry ? entry : { name: entry.name, count: entry.count }

const resolve = (
  quest: Client,
  settings: Parameters<typeof resolveHeadlessDeclareEntries>[0]["settings"],
  globals: ListVariable[] = [],
) =>
  resolveHeadlessDeclareEntries({
    bufferId: BUFFER_ID,
    quest,
    settings,
    globals,
    signal: new AbortController().signal,
  })

describe("resolveHeadlessDeclareEntries", () => {
  beforeEach(async () => {
    await db.notebook_options.clear()
  })

  it("declares stored values without running the option query", async () => {
    // Given
    await saveStoredOptions({
      owner: notebookOptionsOwner(BUFFER_ID),
      name: "pair",
      options: [{ value: "'EURUSD'", label: "EURUSD" }],
      fetchedAt: 1,
      context: variableOptionsContext(
        queryList(
          "pair",
          "SELECT DISTINCT symbol FROM fx_trades",
        ) as Parameters<typeof variableOptionsContext>[0],
        [],
      ),
    })
    const { quest, sent } = makeQuest([])

    // When
    const { entries, report } = await resolve(quest, {
      variables: [queryList("pair", "SELECT DISTINCT symbol FROM fx_trades")],
    })

    // Then
    expect(entries).toEqual([{ name: "pair", value: "'EURUSD'" }])
    expect(report).toEqual([])
    expect(sent).toEqual([])
  })

  it("fetches a missing global before a notebook list that depends on it and stores both", async () => {
    // Given
    const { quest, sent } = makeQuest([
      symbolRows(["LSE"]),
      symbolRows(["EURUSD", "GBPUSD"]),
    ])

    // When
    const { entries, report } = await resolve(
      quest,
      {
        timeRange: { from: "now-1h", to: "now" },
        variables: [
          queryList(
            "pair",
            "SELECT DISTINCT symbol FROM fx_trades WHERE venue = @venue",
          ),
        ],
      },
      [queryList("venue", "SELECT DISTINCT venue FROM fx_trades")],
    )

    // Then
    expect(sent[0]).toContain("SELECT DISTINCT venue FROM fx_trades")
    expect(sent[0]).not.toContain("DECLARE")
    expect(sent[1]).toContain("@venue := 'LSE'")
    expect(sent[1]).not.toContain("@timeFrom")
    expect(entries.map((e) => e.name)).toEqual([
      "timeTo",
      "timeFrom",
      "timeFilter",
      "venue",
      "pair",
    ])
    expect(entries.find((e) => e.name === "pair")?.value).toBe(
      "('EURUSD', 'GBPUSD')",
    )
    expect(report.map(withoutFetchTime)).toEqual([
      { name: "venue", count: 1 },
      { name: "pair", count: 2 },
    ])
    expect(await loadStoredOptions(GLOBAL_OPTIONS_OWNER)).toHaveLength(1)
    expect(
      await loadStoredOptions(notebookOptionsOwner(BUFFER_ID)),
    ).toHaveLength(1)
  })

  it("reports a failed list, stores nothing for it and continues with the next", async () => {
    // Given
    const { quest } = makeQuest([
      { type: "error", error: "table does not exist" },
      symbolRows(["EURUSD"]),
    ])

    // When
    const { entries, report } = await resolve(quest, {
      variables: [
        queryList("broken", "SELECT symbol FROM nope"),
        queryList("pair", "SELECT DISTINCT symbol FROM fx_trades"),
      ],
    })

    // Then
    expect(report.map(withoutFetchTime)).toEqual([
      { name: "broken", error: "table does not exist" },
      { name: "pair", count: 1 },
    ])
    expect(entries).toEqual([{ name: "pair", value: "'EURUSD'" }])
    expect(
      (await loadStoredOptions(notebookOptionsOwner(BUFFER_ID))).map(
        (r) => r.name,
      ),
    ).toEqual(["pair"])
  })

  it("reports a time-dependent list without a time range and runs no query", async () => {
    // Given
    const { quest, sent } = makeQuest([])

    // When
    const { report } = await resolve(quest, {
      variables: [
        queryList(
          "pair",
          "SELECT DISTINCT symbol FROM fx_trades WHERE ts > @timeFrom",
        ),
      ],
    })

    // Then
    expect(report).toEqual([{ name: "pair", error: "Set a time range first." }])
    expect(sent).toEqual([])
  })
  it("resolves each notebook's range and dependent lists while reusing matching inputs", async () => {
    const globals = [
      queryList("venue", "SELECT cast(@timeFrom as string) venue"),
    ]
    const variables = [queryList("pair", "SELECT @venue symbol")]
    const jan = { from: "2025-01-01", to: "2025-01-02" }
    const feb = { from: "2025-02-01", to: "2025-02-02" }
    const { quest, sent } = makeQuest([
      symbolRows(["January"]),
      symbolRows(["January"]),
      symbolRows(["February"]),
      symbolRows(["February"]),
      symbolRows(["January"]),
    ])
    const run = (bufferId: number, timeRange: typeof jan) =>
      resolveHeadlessDeclareEntries({
        bufferId,
        quest,
        settings: { timeRange, variables },
        globals,
        signal: new AbortController().signal,
      })
    await run(7, jan)
    await run(8, feb)
    const again = await run(7, jan)
    expect(again.entries.find((entry) => entry.name === "venue")?.value).toBe(
      "'January'",
    )
    expect(again.entries.find((entry) => entry.name === "pair")?.value).toBe(
      "'January'",
    )
    expect(sent).toHaveLength(5)
    expect(sent[2]).toContain("2025-02-01")
    expect(sent[4]).toContain("2025-01-01")
    // The local January cache is still valid; a repeat also reuses the global.
    await run(7, jan)
    expect(sent).toHaveLength(5)
  })

  it("refreshes legacy cache rows and excludes stale declarations after a failed fetch", async () => {
    await saveStoredOptions({
      owner: GLOBAL_OPTIONS_OWNER,
      name: "venue",
      options: [{ value: "'OLD'", label: "OLD" }],
      fetchedAt: 1,
    })
    const { quest, sent } = makeQuest([{ type: "error", error: "offline" }])
    const result = await resolve(quest, {}, [
      queryList("venue", "SELECT venue FROM t"),
    ])
    expect(sent).toHaveLength(1)
    expect(result.entries).toEqual([])
    expect(result.report).toEqual([{ name: "venue", error: "offline" }])
  })
})

describe("prepareNotebookVariables", () => {
  beforeEach(async () => {
    await db.notebook_options.clear()
  })

  it("checks only the time-bound variables on a time range change and keeps the other errors", async () => {
    // Given a stored list unrelated to the time range, an expression that failed earlier, and a time-bound list
    const unrelated = queryList("symbol", "SELECT symbol FROM trades")
    unrelated.selected = [{ value: "'EURUSD'", label: "EURUSD" }]
    const broken = {
      name: "limit",
      kind: "expression" as const,
      value: "(SELECT max(n) FROM missing)",
    }
    const bound = queryList(
      "pair",
      "SELECT symbol FROM trades WHERE ts > @timeFrom",
    )
    await saveStoredOptions({
      owner: notebookOptionsOwner(BUFFER_ID),
      name: "symbol",
      options: [{ value: "'EURUSD'", label: "EURUSD" }],
      fetchedAt: 1,
      context: variableOptionsContext(
        unrelated as Parameters<typeof variableOptionsContext>[0],
        [],
      ),
    })
    const validated: string[] = []
    const sent: string[] = []
    const quest = {
      validateQuery: (sql: string) => {
        validated.push(sql)
        return Promise.resolve({
          query: sql,
          columns: [{ name: "symbol", type: "SYMBOL" }],
          timestamp: -1,
        })
      },
      queryRaw: (sql: string) => {
        sent.push(sql)
        return {
          promise: Promise.resolve(symbolRows(["GBPUSD"])),
          queryId: "q",
        }
      },
      abort: () => undefined,
    } as unknown as Client

    // When the time range moves
    const prepared = await prepareNotebookVariables(
      {
        quest,
        signal: new AbortController().signal,
        force: new Set(TIME_VARIABLE_NAMES.map((name) => name.toLowerCase())),
        validateAll: false,
        previousErrors: (owner): VariableErrors =>
          owner === GLOBAL_OPTIONS_OWNER ? {} : { limit: "table missing" },
      },
      BUFFER_ID,
      {
        timeRange: { from: "2025-01-01", to: "2025-01-02" },
        variables: [unrelated, broken, bound],
      },
      [],
    )

    // Then only the time-bound list ran, the unrelated list kept its stored values, and the old error survived
    expect(sent).toHaveLength(1)
    expect(sent[0]).toContain("@timeFrom")
    expect(validated.some((sql) => sql.includes("@symbol"))).toBe(false)
    expect(validated.some((sql) => sql.includes("missing"))).toBe(false)
    expect(prepared.notebook.options.symbol.options[0].label).toBe("EURUSD")
    expect(prepared.notebook.errors).toEqual({ limit: "table missing" })
    expect(prepared.notebook.options.pair.options[0].label).toBe("GBPUSD")
  })

  it("rechecks a notebook variable that depends on a global the time range change repaired", async () => {
    // Given a global time-bound list that failed earlier and a notebook expression blocked by it
    const venue = queryList(
      "venue",
      "SELECT venue FROM trades WHERE ts > @timeFrom",
    )
    const settings = {
      timeRange: { from: "2025-01-01", to: "2025-01-02" },
      variables: [
        { name: "first", kind: "expression" as const, value: "@venue" },
      ],
    }
    const { quest, sent } = makeQuest([symbolRows(["LSE"])])
    const previousErrors = (owner: string): VariableErrors =>
      owner === GLOBAL_OPTIONS_OWNER
        ? { venue: "table missing" }
        : { first: "Cannot validate because @venue failed." }

    // When the time range moves and the global query succeeds
    const prepared = await prepareNotebookVariables(
      {
        quest,
        signal: new AbortController().signal,
        force: new Set(TIME_VARIABLE_NAMES.map((name) => name.toLowerCase())),
        validateAll: false,
        previousErrors,
      },
      BUFFER_ID,
      settings,
      [venue],
    )

    // Then both scopes are clean and the expression is declared again
    expect(sent).toHaveLength(1)
    expect(prepared.global.errors).toEqual({})
    expect(prepared.notebook.errors).toEqual({})
    expect(prepared.notebook.entries.map((entry) => entry.name)).toContain(
      "first",
    )
  })
})
