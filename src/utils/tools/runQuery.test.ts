import { describe, expect, it, vi } from "vitest"
import { Type } from "../questdb/types"
import {
  buildRunQueryPayload,
  clampRunQueryLimit,
  mapQueryRawToResult,
  RUN_QUERY_MAX_LIMIT,
  type RunQueryRawResult,
} from "./runQuery"

describe("buildRunQueryPayload", () => {
  const dql = (
    rowCount: number,
    rowFactory: (i: number) => unknown[] = (i) => [i, `name-${i}`],
  ): RunQueryRawResult => ({
    type: "dql",
    columns: [
      { name: "id", type: "INT" },
      { name: "name", type: "VARCHAR" },
    ],
    dataset: Array.from({ length: rowCount }, (_, i) => rowFactory(i)),
    count: rowCount,
    durationMs: 12,
  })

  it("returns DDL/DML/notice envelopes verbatim", () => {
    expect(buildRunQueryPayload({ type: "ddl", durationMs: 5 }, 100)).toEqual({
      type: "ddl",
      ok: true,
      message: null,
      duration_ms: 5,
    })
    expect(
      buildRunQueryPayload(
        { type: "notice", durationMs: 1, message: "hi" },
        100,
      ),
    ).toEqual({ type: "notice", ok: true, message: "hi", duration_ms: 1 })
  })

  it("returns error envelope with position", () => {
    expect(
      buildRunQueryPayload(
        { type: "error", error: "bad sql", position: 7 },
        100,
      ),
    ).toEqual({ error: "bad sql", position: 7 })
  })

  it("returns rows untruncated when within limit and size cap", () => {
    const out = buildRunQueryPayload(dql(3), 100)
    expect(out.type).toBe("dql")
    expect(out.returned_count).toBe(3)
    expect(out.total_count).toBe(3)
    expect(out.truncated).toBe(false)
  })

  it("truncates rows to the requested limit and flags truncated=true", () => {
    const out = buildRunQueryPayload(dql(150), 50)
    expect(out.returned_count).toBe(50)
    expect(out.total_count).toBe(150)
    expect(out.truncated).toBe(true)
  })

  it("clamps limit at the hard cap (1000)", () => {
    const out = buildRunQueryPayload(dql(1500), 999_999)
    expect(out.returned_count).toBe(1000)
    expect(out.total_count).toBe(1500)
    expect(out.truncated).toBe(true)
  })

  it("clips long string cells to ~500 chars and flags truncated=true", () => {
    const longString = "x".repeat(2000)
    const out = buildRunQueryPayload(
      dql(1, () => [longString, "y"]),
      100,
    ) as { rows: string[][]; truncated: boolean }
    expect(out.rows[0][0].length).toBeLessThanOrEqual(500)
    expect(out.rows[0][0].endsWith("...")).toBe(true)
    expect(out.truncated).toBe(true)
  })

  it("drops trailing rows to keep payload under ~50 KB", () => {
    // ~200 chars/row × 1000 rows ≈ 200 KB; cap should clip back to ≤ 50 KB.
    const filler = "z".repeat(100)
    const out = buildRunQueryPayload(
      dql(1000, () => [filler, filler]),
      1000,
    ) as { returned_count: number; truncated: boolean }
    expect(out.returned_count).toBeLessThan(1000)
    expect(out.truncated).toBe(true)
  })

  it("preserves native number / boolean / null values", () => {
    const out = buildRunQueryPayload(
      dql(1, () => [42, true, null, "ok"]),
      10,
    ) as { rows: unknown[][] }
    expect(out.rows[0]).toEqual([42, true, null, "ok"])
  })
})

describe("mapQueryRawToResult", () => {
  it("sends the requested row limit to /exec using the grid queryRaw option", async () => {
    const queryRaw = vi.fn().mockResolvedValue({
      type: Type.DQL,
      columns: [],
      dataset: [],
      count: 0,
    })
    await mapQueryRawToResult({ queryRaw } as never, "SELECT * FROM x", 25)
    expect(queryRaw).toHaveBeenCalledWith("SELECT * FROM x", {
      limit: "0,25",
    })
  })

  it("clamps the network limit before sending the request", async () => {
    const queryRaw = vi.fn().mockResolvedValue({
      type: Type.DQL,
      columns: [],
      dataset: [],
      count: 0,
    })
    await mapQueryRawToResult({ queryRaw } as never, "SELECT * FROM x", 99_999)
    expect(queryRaw).toHaveBeenCalledWith("SELECT * FROM x", {
      limit: `0,${RUN_QUERY_MAX_LIMIT}`,
    })
    expect(clampRunQueryLimit(0)).toBe(1)
  })

  it("passes abort signal alongside the limit option", async () => {
    const queryRaw = vi.fn().mockResolvedValue({
      type: Type.DQL,
      columns: [],
      dataset: [],
      count: 0,
    })
    const ac = new AbortController()
    await mapQueryRawToResult(
      { queryRaw } as never,
      "SELECT * FROM x",
      10,
      ac.signal,
    )
    expect(queryRaw).toHaveBeenCalledWith("SELECT * FROM x", {
      limit: "0,10",
      signal: ac.signal,
    })
  })
})
