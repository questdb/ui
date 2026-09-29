import "../../../../test/stubBrowserGlobals"
import { describe, expect, it, vi } from "vitest"
import type { ListVariable } from "../../../../store/notebook"
import type { Client } from "../../../../utils/questdb/client"
import { prepareVariables } from "./prepareVariables"

const list = (name: string, query: string): ListVariable => ({
  name,
  kind: "list",
  source: { type: "query", query },
  sort: "none",
  multi: true,
  includeAll: true,
  all: { mode: "list" },
  selected: "all",
})
const client = (responses: unknown[]) => ({
  validateQuery: vi.fn((query: string) =>
    Promise.resolve({
      query,
      columns: [],
      timestamp: -1,
    }),
  ),
  queryRaw: vi.fn((_sql: string) => ({
    queryId: "q",
    promise: Promise.resolve(responses.shift()),
  })),
  abort: vi.fn(),
})
const rows = (n: number) => ({
  type: "dql",
  columns: [{ name: "n", type: "INT" }],
  dataset: [[n]],
  count: 1,
})

describe("prepareVariables", () => {
  it("fetches a changed chain in order using fresh values and leaves unrelated lists alone", async () => {
    // Given
    const quest = client([rows(2), rows(3)])
    const variables = [
      list("a", "SELECT 2"),
      list("b", "SELECT @a + 1"),
      list("other", "SELECT 99"),
    ]
    const options = {
      other: {
        options: [{ value: "99", label: "99" }],
        columns: ["n"],
        truncated: false,
        warnings: [],
        fetchedAt: 1,
      },
    }
    // When
    const prepared = await prepareVariables({
      quest: quest as unknown as Client,
      settings: { variables },
      prefixEntries: [],
      options,
      errors: {},
      changed: ["a"],
      refresh: ["a"],
      signal: new AbortController().signal,
    })
    // Then
    expect(quest.queryRaw).toHaveBeenCalledTimes(2)
    expect(quest.queryRaw.mock.calls[1]?.[0]).toContain("@a := 2")
    expect(prepared.options.b.options[0].value).toBe("3")
    expect(prepared.errors).toEqual({})
    expect(options).not.toHaveProperty("a")
  })

  it("collects errors, blocks dependents, and still validates independent variables", async () => {
    // Given
    const quest = client([{ type: "error", error: "table missing" }, rows(9)])
    const variables = [
      list("a", "SELECT n FROM missing"),
      list("b", "SELECT @a"),
      list("other", "SELECT 9"),
    ]
    // When
    const prepared = await prepareVariables({
      quest: quest as unknown as Client,
      settings: { variables },
      prefixEntries: [],
      options: {},
      errors: {},
      changed: ["a", "other"],
      refresh: ["a", "other"],
      signal: new AbortController().signal,
    })
    // Then
    expect(prepared.errors.a).toBe("table missing")
    expect(prepared.errors.b).toContain("@a")
    expect(prepared.options.other.options[0].value).toBe("9")
    expect(prepared.entries.map((entry) => entry.name)).toEqual(["other"])
    expect(quest.queryRaw).toHaveBeenCalledTimes(2)
  })

  it.each(["one", "all"])(
    "reuses loaded options without server calls when selecting %s",
    async (selection) => {
      // Given
      const quest = client([])
      const variable = list("a", "SELECT n FROM numbers")
      variable.selected =
        selection === "all" ? "all" : [{ value: "2", label: "2" }]
      const options = {
        a: {
          options: [
            { value: "1", label: "1" },
            { value: "2", label: "2" },
          ],
          columns: ["n"],
          truncated: false,
          warnings: [],
          fetchedAt: 1,
        },
      }
      // When
      const prepared = await prepareVariables({
        quest: quest as unknown as Client,
        settings: { variables: [variable] },
        prefixEntries: [],
        options,
        errors: {},
        changed: ["a"],
        refresh: [],
        signal: new AbortController().signal,
      })
      // Then
      expect(quest.queryRaw).not.toHaveBeenCalled()
      expect(quest.validateQuery).not.toHaveBeenCalled()
      expect(prepared.options.a).toBe(options.a)
      expect(prepared.entries).toEqual([
        { name: "a", value: selection === "all" ? "(1, 2)" : "2" },
      ])
    },
  )

  it("fetches dependent lists using the new selection without refetching the selected list", async () => {
    // Given
    const quest = client([rows(3)])
    const a = list("a", "SELECT n FROM numbers")
    a.selected = [{ value: "2", label: "2" }]
    const options = {
      a: {
        options: [
          { value: "1", label: "1" },
          { value: "2", label: "2" },
        ],
        columns: ["n"],
        truncated: false,
        warnings: [],
        fetchedAt: 1,
      },
    }
    // When
    const prepared = await prepareVariables({
      quest: quest as unknown as Client,
      settings: {
        variables: [
          a,
          { name: "middle", kind: "expression", value: "@a + 1" },
          list("b", "SELECT @middle"),
        ],
      },
      prefixEntries: [],
      options,
      errors: {},
      changed: ["a"],
      refresh: [],
      signal: new AbortController().signal,
    })
    // Then
    expect(quest.queryRaw).toHaveBeenCalledTimes(1)
    expect(quest.queryRaw.mock.calls[0][0]).toContain("@a := 2")
    expect(quest.queryRaw.mock.calls[0][0]).toContain("@middle := @a + 1")
    expect(prepared.options.a).toBe(options.a)
    expect(prepared.options.b.options[0].value).toBe("3")
  })

  it("re-validates an untouched variable with an old error when validateAll is set", async () => {
    // Given an expression that failed earlier and nothing that references it
    const quest = client([])
    const variables = [
      { name: "limit", kind: "expression" as const, value: "42" },
    ]
    // When
    const prepared = await prepareVariables({
      quest: quest as unknown as Client,
      settings: { variables },
      prefixEntries: [],
      options: {},
      errors: { limit: "table missing" },
      changed: [],
      refresh: [],
      validateAll: true,
      signal: new AbortController().signal,
    })
    // Then the server was asked again and the old error is gone
    expect(quest.validateQuery).toHaveBeenCalledTimes(1)
    expect(prepared.errors).toEqual({})
    expect(prepared.entries.map((entry) => entry.name)).toEqual(["limit"])
  })

  it("fetches on load without validating the DECLARE entries", async () => {
    // Given a list whose stored selection is validated after a normal fetch
    const prepare = (validateEntries: boolean) => {
      const quest = client([rows(2)])
      const a = list("a", "SELECT n FROM numbers")
      a.selected = [{ value: "2", label: "2" }]
      return prepareVariables({
        quest: quest as unknown as Client,
        settings: { variables: [a] },
        prefixEntries: [],
        options: {},
        errors: {},
        changed: [],
        refresh: ["a"],
        validateEntries,
        signal: new AbortController().signal,
      }).then((prepared) => ({ prepared, quest }))
    }
    // When
    const normal = await prepare(true)
    const load = await prepare(false)
    // Then the load skips the DECLARE round trip and keeps only the source query check
    expect(normal.quest.validateQuery).toHaveBeenCalledTimes(2)
    expect(normal.quest.validateQuery.mock.calls[1][0]).toContain("@a := 2")
    expect(load.quest.validateQuery).toHaveBeenCalledTimes(1)
    expect(load.quest.validateQuery.mock.calls[0][0]).not.toContain("@a :=")
    expect(load.prepared.options.a.options[0].value).toBe("2")
    expect(load.prepared.errors).toEqual({})
  })

  it("validates the source query but keeps all 10,000 fetched options without validating their expansion", async () => {
    // Given
    const query = "SELECT x FROM long_sequence(10000)"
    const dataset = Array.from({ length: 10000 }, (_, index) => [index + 1])
    const quest = client([{ ...rows(1), dataset, count: dataset.length }])

    // When
    const prepared = await prepareVariables({
      quest: quest as unknown as Client,
      settings: { variables: [list("a", query)] },
      prefixEntries: [],
      options: {},
      errors: {},
      changed: ["a"],
      refresh: ["a"],
      signal: new AbortController().signal,
    })

    // Then
    expect(quest.validateQuery.mock.calls.map(([sql]) => sql)).toEqual([query])
    expect(quest.queryRaw).toHaveBeenCalledTimes(1)
    expect(prepared.errors).toEqual({})
    expect(prepared.options.a.options).toHaveLength(10000)
    expect(prepared.entries).toEqual([
      { name: "a", value: `(${dataset.map(([value]) => value).join(", ")})` },
    ])
  })

  it("rejects an invalid source query even when All uses the query results", async () => {
    // Given
    const quest = client([])
    quest.validateQuery.mockRejectedValueOnce(new Error("invalid query"))

    // When
    const prepared = await prepareVariables({
      quest: quest as unknown as Client,
      settings: { variables: [list("a", "SELECT invalid")] },
      prefixEntries: [],
      options: {},
      errors: {},
      changed: ["a"],
      refresh: ["a"],
      signal: new AbortController().signal,
    })

    // Then
    expect(quest.queryRaw).not.toHaveBeenCalled()
    expect(prepared.errors.a).toBe("Could not validate the query.")
    expect(prepared.options).toEqual({})
    expect(prepared.entries).toEqual([])
  })

  it.each(["-1", "abs(-1)"])(
    "validates a custom All value even when it is a literal: %s",
    async (value) => {
      // Given
      const quest = client([])
      const variable: ListVariable = {
        ...list("a", "SELECT 2"),
        all: { mode: "custom", value },
      }

      // When
      await prepareVariables({
        quest: quest as unknown as Client,
        settings: { variables: [variable] },
        prefixEntries: [],
        options: {
          a: {
            options: [{ value: "2", label: "2" }],
            columns: ["n"],
            truncated: false,
            warnings: [],
            fetchedAt: 1,
          },
        },
        errors: {},
        changed: ["a"],
        refresh: [],
        signal: new AbortController().signal,
      })

      // Then
      expect(quest.queryRaw).not.toHaveBeenCalled()
      expect(quest.validateQuery).toHaveBeenCalledTimes(1)
      expect(quest.validateQuery.mock.calls[0][0]).toContain(`@a := ${value}`)
    },
  )

  it.each(["'O''Hara'", "-2.5e3", "abs(-1)"])(
    "validates All from user-defined lists, including literals: %s",
    async (value) => {
      // Given
      const quest = client([])
      const variable: ListVariable = {
        ...list("a", "SELECT 1"),
        source: { type: "custom", entries: value },
        selected: "all",
      }

      // When
      await prepareVariables({
        quest: quest as unknown as Client,
        settings: { variables: [variable] },
        prefixEntries: [],
        options: {},
        errors: {},
        changed: ["a"],
        refresh: [],
        signal: new AbortController().signal,
      })

      // Then
      expect(quest.queryRaw).not.toHaveBeenCalled()
      expect(quest.validateQuery).toHaveBeenCalledTimes(1)
      expect(quest.validateQuery.mock.calls[0][0]).toContain(`@a := ${value}`)
    },
  )

  it("keeps a list named __proto__ as its own fetched entry", async () => {
    // Given
    const quest = client([rows(7)])
    const variables = [list("__proto__", "SELECT 7")]
    // When
    const prepared = await prepareVariables({
      quest: quest as unknown as Client,
      settings: { variables },
      prefixEntries: [],
      options: {},
      errors: {},
      changed: ["__proto__"],
      refresh: ["__proto__"],
      signal: new AbortController().signal,
    })
    // Then
    expect(quest.queryRaw).toHaveBeenCalledTimes(1)
    expect(Object.keys(prepared.options)).toEqual(["__proto__"])
    expect(prepared.entries).toEqual([{ name: "__proto__", value: "7" }])
    expect(prepared.errors).toEqual({})
  })

  it("does not read an inherited Object member as a previous error or option", async () => {
    // Given
    const quest = client([rows(1)])
    const variables = [list("a", "SELECT 1"), list("toString", "SELECT 2")]
    const options = {
      toString: {
        options: [{ value: "2", label: "2" }],
        columns: ["n"],
        truncated: false,
        warnings: [],
        fetchedAt: 1,
      },
    }
    // When
    const prepared = await prepareVariables({
      quest: quest as unknown as Client,
      settings: { variables },
      prefixEntries: [],
      options,
      errors: {},
      changed: ["a"],
      refresh: ["a"],
      signal: new AbortController().signal,
    })
    // Then
    expect(quest.queryRaw).toHaveBeenCalledTimes(1)
    expect(prepared.errors).toEqual({})
    expect(prepared.entries.map((entry) => entry.name)).toEqual([
      "a",
      "toString",
    ])
  })

  it("discards a late response after cancellation", async () => {
    // Given
    const controller = new AbortController()
    const quest = client([])
    quest.queryRaw.mockImplementation(() => ({
      queryId: "q",
      promise: Promise.resolve().then(() => {
        controller.abort()
        return rows(2)
      }),
    }))
    // When
    const prepare = prepareVariables({
      quest: quest as unknown as Client,
      settings: { variables: [list("a", "SELECT 2")] },
      prefixEntries: [],
      options: {},
      errors: {},
      changed: ["a"],
      refresh: ["a"],
      signal: controller.signal,
    })
    // Then
    await expect(prepare).rejects.toMatchObject({ name: "AbortError" })
  })
})
