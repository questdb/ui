import "../../test/stubBrowserGlobals"
import { afterEach, describe, expect, it, vi } from "vitest"
import { Client } from "./client"
import { stringifyWithBigInts } from "./serialize"
import { Type } from "./types"
import type { QueryRawResult } from "./types"
import type { TableKind } from "./types"

const response = (body: Record<string, unknown>): Response =>
  ({
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify(body)),
  }) as Response

afterEach(() => {
  vi.unstubAllGlobals()
})

const rawDqlResult = (
  columns: Array<{ name: string; type: string }>,
  dataset: Array<Array<string | number | boolean | null>>,
): QueryRawResult => ({
  columns,
  count: dataset.length,
  dataset,
  error: undefined,
  notice: undefined,
  query: "catalog()",
  timings: {
    compiler: 0,
    authentication: 0,
    count: 0,
    execute: 0,
    fetch: 0,
  },
  type: Type.DQL,
})

describe("Client catalog LONG conversion", () => {
  it("converts every LONG column to bigint without changing other columns", () => {
    const raw = rawDqlResult(
      [
        { name: "safe_long", type: "LONG" },
        { name: "max_long", type: "LONG" },
        { name: "min_long", type: "LONG" },
        { name: "nullable_long", type: "LONG" },
        { name: "ratio", type: "DOUBLE" },
        { name: "name", type: "STRING" },
      ],
      [
        [
          "42",
          "9223372036854775807",
          "-9223372036854775807",
          null,
          1.5,
          "trades",
        ],
      ],
    )

    const result = Client.transformQueryRawResult<Record<string, unknown>>(
      raw,
      { convertLongsToBigInt: true },
    )

    expect(result.type).toBe(Type.DQL)
    if (result.type !== Type.DQL) throw new Error("expected DQL result")
    expect(result.data[0]).toEqual({
      safe_long: BigInt(42),
      max_long: BigInt("9223372036854775807"),
      min_long: BigInt("-9223372036854775807"),
      nullable_long: null,
      ratio: 1.5,
      name: "trades",
    })
  })

  it("leaves regular query LONG values in their existing wire form", () => {
    const raw = rawDqlResult(
      [{ name: "value", type: "LONG" }],
      [["9007199254740993"]],
    )

    const result = Client.transformQueryRawResult<Record<string, unknown>>(raw)

    expect(result.type).toBe(Type.DQL)
    if (result.type !== Type.DQL) throw new Error("expected DQL result")
    expect(result.data[0].value).toBe("9007199254740993")
  })

  it("rejects a LONG number that has already lost integer precision", () => {
    const raw = rawDqlResult(
      [{ name: "value", type: "LONG" }],
      [[Number("9007199254740993")]],
    )

    expect(() =>
      Client.transformQueryRawResult(raw, { convertLongsToBigInt: true }),
    ).toThrow("Invalid LONG value for column value")
  })

  it("serializes bigint as a decimal string at a JSON boundary", () => {
    expect(stringifyWithBigInts({ value: BigInt("9223372036854775807") })).toBe(
      '{"value":"9223372036854775807"}',
    )
  })
})

describe("Client queryRaw NOTICE timings", () => {
  it("adds fetch timing when the notice carries server timings", async () => {
    // Given a notice response with the regular query timing fields
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response({
          notice: "partition converted",
          timings: {
            compiler: 1,
            authentication: 2,
            count: 3,
            execute: 4,
          },
        }),
      ),
    )

    // When the raw query response is mapped
    const result = await new Client().queryRaw("SELECT 1")

    // Then NOTICE keeps its fields and receives the measured fetch timing
    expect(result.type).toBe(Type.NOTICE)
    if (result.type !== Type.NOTICE) throw new Error("expected notice")
    expect(result.timings).toMatchObject({
      compiler: 1,
      authentication: 2,
      count: 3,
      execute: 4,
    })
    expect(typeof result.timings?.fetch).toBe("number")
  })

  it("keeps timings absent when the notice has none", async () => {
    // Given a message-only notice response
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response({ notice: "hint applied" })),
    )

    // When the raw query response is mapped
    const result = await new Client().queryRaw("SELECT 1")

    // Then no partial timing object is invented
    expect(result.type).toBe(Type.NOTICE)
    expect(result).not.toHaveProperty("timings")
  })
})

describe("Client catalog method wiring", () => {
  const catalogResponse = (
    tableName: string,
    rowCount: string | null,
  ): Response =>
    response({
      columns: [
        { name: "table_name", type: "STRING" },
        { name: "table_row_count", type: "LONG" },
      ],
      count: 1,
      dataset: [[tableName, rowCount]],
      timings: { compiler: 0, authentication: 0, count: 0, execute: 0 },
    })

  it("returns showTables catalog LONGs as bigint", async () => {
    // Given a tables() response whose LONG arrives as a quoted decimal string
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(catalogResponse("trades", "9007199254740993")),
    )

    // When the schema catalog is listed
    const result = await new Client().showTables()

    // Then the row count keeps its full 64-bit precision
    expect(result.type).toBe(Type.DQL)
    if (result.type !== Type.DQL) throw new Error("expected DQL result")
    expect(result.data[0].table_row_count).toBe(BigInt("9007199254740993"))
  })

  it("returns getTableDetails catalog LONGs as bigint", async () => {
    // Given a single-table tables() response
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(catalogResponse("trades", "9007199254740993")),
    )

    // When one table's details are fetched
    const result = await new Client().getTableDetails("trades")

    // Then the row count keeps its full 64-bit precision
    expect(result.type).toBe(Type.DQL)
    if (result.type !== Type.DQL) throw new Error("expected DQL result")
    expect(result.data[0].table_row_count).toBe(BigInt("9007199254740993"))
  })

  it("escapes single quotes in the table name it filters on", async () => {
    // Given a table whose name carries a single quote
    const fetchMock = vi.fn<[string], Promise<Response>>(() =>
      Promise.resolve(catalogResponse("o'brien", "1")),
    )
    vi.stubGlobal("fetch", fetchMock)

    // When its details are fetched
    await new Client().getTableDetails("o'brien")

    // Then the quote is doubled so the predicate stays a single string literal
    expect(decodeURIComponent(fetchMock.mock.calls[0][0])).toContain(
      "tables() where table_name = 'o''brien';",
    )
  })
})

describe("Client showDDL kind routing", () => {
  it("sends the kind-specific SHOW CREATE statement for every table kind", async () => {
    // Given a client whose requests are captured
    const fetchMock = vi.fn<[string], Promise<Response>>(() =>
      Promise.resolve(response({ notice: "ok" })),
    )
    vi.stubGlobal("fetch", fetchMock)
    const client = new Client()
    const kinds: TableKind[] = ["table", "matview", "view", "liveview"]

    // When DDL is requested for each kind
    for (const kind of kinds) {
      await client.showDDL("my_target", kind)
    }

    // Then each kind maps to its own SHOW CREATE statement
    const sentQueries = fetchMock.mock.calls.map(([url]) =>
      decodeURIComponent(url),
    )
    expect(sentQueries[0]).toContain("SHOW CREATE TABLE 'my_target';")
    expect(sentQueries[1]).toContain(
      "SHOW CREATE MATERIALIZED VIEW 'my_target';",
    )
    expect(sentQueries[2]).toContain("SHOW CREATE VIEW 'my_target';")
    expect(sentQueries[3]).toContain("SHOW CREATE LIVE VIEW 'my_target';")
  })
})
