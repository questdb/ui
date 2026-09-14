import { describe, expect, it, vi } from "vitest"
import type { ListVariable } from "../../../../../store/notebook"
import type { Client } from "../../../../../utils/questdb/client"
import type { VariableScope } from "../scope"
import type { VariableDraft } from "../variableDrafts"
import { prepareDrafts, type ScopedListOptions } from "./prepareDrafts"

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

const draft = (
  variable: VariableDraft["variable"],
  scope: VariableScope = "notebook",
): VariableDraft => ({ key: variable.name, variable, scope })

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

const accept = () => Promise.resolve(null)

const prepare = (
  quest: Client,
  drafts: VariableDraft[],
  changed: string[],
  redefined: string[] = [],
  validate: (
    index: number,
    known: ScopedListOptions,
  ) => Promise<string | null> = accept,
  onStep = vi.fn(),
) =>
  prepareDrafts({
    quest,
    drafts,
    timeRange: undefined,
    changed,
    redefined,
    options: { global: {}, notebook: {} },
    signal: new AbortController().signal,
    validate,
    onStep,
  })

describe("prepareDrafts", () => {
  it("fetches the affected chain top to bottom and declares the fresh values above", async () => {
    // Given
    const { quest, sent } = makeQuest([
      symbolRows(["LSE"]),
      symbolRows(["EURUSD", "GBPUSD"]),
    ])
    const drafts = [
      draft({ name: "region", kind: "text", value: "'EU'" }, "global"),
      draft(
        queryList("venue", "SELECT venue FROM t WHERE region = @region"),
        "global",
      ),
      draft(queryList("pair", "SELECT symbol FROM t WHERE venue = @venue")),
      draft(queryList("size", "SELECT size FROM t")),
    ]
    const onStep = vi.fn()

    // When
    const result = await prepare(quest, drafts, ["region"], [], accept, onStep)

    // Then
    expect(
      onStep.mock.calls.map(([step]: [{ kind: string; name: string }]) =>
        [step.kind, step.name].join(":"),
      ),
    ).toEqual([
      "validating:region",
      "validating:venue",
      "fetching:venue",
      "validating:pair",
      "fetching:pair",
      "validating:size",
    ])
    expect(sent[0]).toContain("@region := 'EU'")
    expect(sent[1]).toContain("@venue := 'LSE'")
    expect(sent[1]).not.toContain("@region")
    expect(result.kind).toBe("ready")
    if (result.kind !== "ready") return
    expect(Object.keys(result.prefetched.global)).toEqual(["venue"])
    expect(Object.keys(result.prefetched.notebook)).toEqual(["pair"])
    expect(result.prefetched.notebook.pair.options).toEqual([
      { value: "'EURUSD'", label: "EURUSD" },
      { value: "'GBPUSD'", label: "GBPUSD" },
    ])
  })

  it("stops at the first failure of a redefined list and names the variable", async () => {
    // Given
    const { quest, sent } = makeQuest([
      { type: "error", error: "table does not exist" },
      symbolRows(["EURUSD"]),
    ])
    const drafts = [
      draft(queryList("venue", "SELECT venue FROM missing")),
      draft(queryList("pair", "SELECT symbol FROM t WHERE venue = @venue")),
    ]

    // When
    const result = await prepare(quest, drafts, ["venue"], ["venue"])

    // Then
    expect(result).toEqual({
      kind: "error",
      name: "venue",
      error: "table does not exist",
    })
    expect(sent).toHaveLength(1)
  })

  it("fetches nothing when no list depends on the change", async () => {
    // Given
    const { quest, sent } = makeQuest([])
    const drafts = [
      draft({ name: "region", kind: "text", value: "'EU'" }),
      draft(queryList("size", "SELECT size FROM t")),
    ]

    // When
    const result = await prepare(quest, drafts, ["region"])

    // Then
    expect(result).toEqual({
      kind: "ready",
      prefetched: { global: {}, notebook: {} },
    })
    expect(sent).toEqual([])
  })

  it("validates each draft with the values fetched above it", async () => {
    // Given
    const { quest } = makeQuest([symbolRows(["LSE"]), symbolRows(["EURUSD"])])
    const drafts = [
      draft(queryList("venue", "SELECT venue FROM t")),
      draft(queryList("pair", "SELECT symbol FROM t WHERE venue = @venue")),
    ]
    const seen: string[][] = []
    const validate = (_index: number, known: ScopedListOptions) => {
      seen.push(Object.keys(known.notebook))
      return Promise.resolve(null)
    }

    // When
    const result = await prepare(quest, drafts, [], ["venue"], validate)

    // Then
    expect(result.kind).toBe("ready")
    expect(seen).toEqual([[], ["venue"]])
  })

  it("stops at a validation failure before fetching that draft", async () => {
    // Given
    const { quest, sent } = makeQuest([symbolRows(["LSE"])])
    const drafts = [draft(queryList("venue", "SELECT venue FROM t"))]

    // When
    const result = await prepare(quest, drafts, [], ["venue"], () =>
      Promise.resolve("Invalid column: venue"),
    )

    // Then
    expect(result).toEqual({
      kind: "error",
      name: "venue",
      error: "Invalid column: venue",
    })
    expect(sent).toEqual([])
  })
})
