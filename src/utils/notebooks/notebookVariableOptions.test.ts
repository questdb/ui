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
import type { Client } from "../questdb/client"
import {
  resolveHeadlessDeclareEntries,
  type VariableValuesEntry,
} from "./notebookVariableOptions"

const BUFFER_ID = 7

const queryList = (name: string, query: string): ListVariable => ({
  name,
  kind: "list",
  source: { type: "query", query, refresh: "onLoad" },
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
})
