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

  it("clamps limit at the hard cap (RUN_QUERY_MAX_LIMIT)", () => {
    const out = buildRunQueryPayload(dql(15_000), 999_999)
    expect(out.returned_count).toBe(RUN_QUERY_MAX_LIMIT)
    expect(out.total_count).toBe(15_000)
    expect(out.truncated).toBe(true)
  })

  it("does not clip long string cells (per-cell cap removed)", () => {
    const longString = "x".repeat(2000)
    const out = buildRunQueryPayload(
      dql(1, () => [longString, "y"]),
      100,
    ) as { rows: string[][]; truncated: boolean }
    expect(out.rows[0][0]).toBe(longString)
    expect(out.rows[0][0].length).toBe(2000)
  })

  it("drops trailing rows to keep payload under ~1 MB", () => {
    // ~2400 chars/row × 1000 rows ≈ 2.4 MB; cap should clip back to ≤ 1 MB.
    const filler = "z".repeat(1200)
    const out = buildRunQueryPayload(
      dql(1000, () => [filler, filler]),
      1000,
    ) as { returned_count: number; truncated: boolean }
    expect(out.returned_count).toBeLessThan(1000)
    expect(out.truncated).toBe(true)
  })

  it("always includes the first row even when it alone exceeds the byte cap", () => {
    // 2 MB string in a single cell — single-row payload exceeds the 1 MB
    // cap. We still return that one row (empty `rows` confuses agents) and
    // flag truncated:true.
    const huge = "x".repeat(2_000_000)
    const out = buildRunQueryPayload(
      dql(3, () => [huge]),
      10,
    ) as { rows: string[][]; returned_count: number; truncated: boolean }
    expect(out.returned_count).toBe(1)
    expect(out.rows[0][0].length).toBe(2_000_000)
    expect(out.truncated).toBe(true)
  })

  it("preserves native number / boolean / null values", () => {
    const out = buildRunQueryPayload(
      dql(1, () => [42, true, null, "ok"]),
      10,
    ) as { rows: unknown[][] }
    expect(out.rows[0]).toEqual([42, true, null, "ok"])
  })

  it("flattens non-primitive cells (arrays/objects) to JSON strings", () => {
    const out = buildRunQueryPayload(
      dql(1, () => [{ a: 1 }, [1, 2, 3]]),
      10,
    ) as { rows: unknown[][] }
    expect(out.rows[0]).toEqual(['{"a":1}', "[1,2,3]"])
  })
})

describe("mapQueryRawToResult", () => {
  const stubDqlReturn = () => ({
    promise: Promise.resolve({
      type: Type.DQL,
      columns: [],
      dataset: [],
      count: 0,
    }),
    queryId: 1,
  })

  it("sends the requested row limit to /exec using the cancellable queryRaw overload", async () => {
    const queryRaw = vi.fn().mockReturnValue(stubDqlReturn())
    const abort = vi.fn()
    await mapQueryRawToResult(
      { queryRaw, abort } as never,
      "SELECT * FROM x",
      25,
    )
    expect(queryRaw).toHaveBeenCalledWith("SELECT * FROM x", {
      limit: "0,25",
      cancellable: true,
    })
  })

  it("clamps the network limit before sending the request", async () => {
    const queryRaw = vi.fn().mockReturnValue(stubDqlReturn())
    const abort = vi.fn()
    await mapQueryRawToResult(
      { queryRaw, abort } as never,
      "SELECT * FROM x",
      99_999,
    )
    expect(queryRaw).toHaveBeenCalledWith("SELECT * FROM x", {
      limit: `0,${RUN_QUERY_MAX_LIMIT}`,
      cancellable: true,
    })
    expect(clampRunQueryLimit(0)).toBe(1)
  })

  it("aborts the live query via questClient.abort(queryId) when the caller signal fires", async () => {
    const queryRaw = vi.fn().mockReturnValue(stubDqlReturn())
    const abort = vi.fn()
    const ac = new AbortController()
    const done = mapQueryRawToResult(
      { queryRaw, abort } as never,
      "SELECT * FROM x",
      10,
      ac.signal,
    )
    ac.abort()
    await done
    expect(queryRaw).toHaveBeenCalledWith("SELECT * FROM x", {
      limit: "0,10",
      cancellable: true,
    })
    expect(abort).toHaveBeenCalledWith(1)
  })

  it("aborts immediately when the caller signal is already aborted at call time", async () => {
    const queryRaw = vi.fn().mockReturnValue(stubDqlReturn())
    const abort = vi.fn()
    const ac = new AbortController()
    ac.abort()
    await mapQueryRawToResult(
      { queryRaw, abort } as never,
      "SELECT * FROM x",
      10,
      ac.signal,
    )
    expect(abort).toHaveBeenCalledWith(1)
  })
})
