import type { Client } from "../questdb/client"
import { Type } from "../questdb/types"

export const RUN_QUERY_DEFAULT_LIMIT = 100
export const RUN_QUERY_MAX_LIMIT = 1000
const RUN_QUERY_CELL_CHAR_CAP = 500
const RUN_QUERY_PAYLOAD_BYTE_CAP = 50_000

export type RunQueryRawResult =
  | {
      type: "dql"
      columns: Array<{ name: string; type?: string }>
      dataset: Array<Array<unknown>>
      count: number
      durationMs?: number
    }
  | { type: "ddl" | "dml" | "notice"; durationMs?: number; message?: string }
  | { type: "error"; error: string; position?: number }

const clipCellValue = (raw: unknown): { value: unknown; clipped: boolean } => {
  if (raw === null || raw === undefined) return { value: null, clipped: false }
  if (typeof raw === "number" || typeof raw === "boolean") {
    return { value: raw, clipped: false }
  }
  const text = typeof raw === "string" ? raw : JSON.stringify(raw)
  if (text.length <= RUN_QUERY_CELL_CHAR_CAP) {
    return { value: text, clipped: false }
  }
  return {
    value: text.slice(0, RUN_QUERY_CELL_CHAR_CAP - 3) + "...",
    clipped: true,
  }
}

export const buildRunQueryPayload = (
  raw: RunQueryRawResult,
  requestedLimit: number,
): Record<string, unknown> => {
  if (raw.type === "error") {
    return { error: raw.error, position: raw.position ?? -1 }
  }
  if (raw.type !== "dql") {
    return {
      type: raw.type,
      ok: true,
      message: raw.message ?? null,
      duration_ms: raw.durationMs ?? null,
    }
  }

  const totalCount = raw.count
  const limit = Math.min(
    Math.max(1, Math.floor(requestedLimit)),
    RUN_QUERY_MAX_LIMIT,
  )
  const rowsBeforeCellClip = raw.dataset.slice(0, limit)
  const rowCountClipped = totalCount > rowsBeforeCellClip.length
  let cellClipped = false
  const rowsAfterCellClip = rowsBeforeCellClip.map((row) =>
    row.map((value) => {
      const out = clipCellValue(value)
      if (out.clipped) cellClipped = true
      return out.value
    }),
  )

  let rows = rowsAfterCellClip
  const buildPayload = (rs: typeof rows) => ({
    type: "dql" as const,
    columns: raw.columns,
    rows: rs,
    returned_count: rs.length,
    total_count: totalCount,
    truncated:
      rowCountClipped || cellClipped || rs.length < rowsAfterCellClip.length,
    duration_ms: raw.durationMs ?? null,
  })
  while (
    rows.length > 0 &&
    JSON.stringify(buildPayload(rows)).length > RUN_QUERY_PAYLOAD_BYTE_CAP
  ) {
    rows = rows.slice(0, rows.length - 1)
  }
  return buildPayload(rows)
}

export const clampRunQueryLimit = (requestedLimit: number): number =>
  Math.min(Math.max(1, Math.floor(requestedLimit)), RUN_QUERY_MAX_LIMIT)

export const mapQueryRawToResult = async (
  questClient: Client,
  sql: string,
  requestedLimit: number,
  signal?: AbortSignal,
): Promise<RunQueryRawResult> => {
  const startedAt = performance.now()
  try {
    const limit = clampRunQueryLimit(requestedLimit)
    const res = await questClient.queryRaw(sql, {
      limit: `0,${limit}`,
      ...(signal ? { signal } : {}),
    })
    const durationMs = Math.round(performance.now() - startedAt)
    if (res.type === Type.DQL) {
      return {
        type: "dql",
        columns: res.columns,
        dataset: res.dataset,
        count: res.count,
        durationMs,
      }
    }
    if (res.type === Type.DDL || res.type === Type.DML) {
      return { type: res.type, durationMs }
    }
    if (res.type === Type.NOTICE) {
      return { type: "notice", durationMs, message: res.notice }
    }
    return { type: "error", error: res.error, position: res.position }
  } catch (e) {
    if (e && typeof e === "object" && "error" in e) {
      const errLike = e as { error?: unknown; position?: unknown }
      if (typeof errLike.error === "string") {
        return {
          type: "error",
          error: errLike.error,
          position:
            typeof errLike.position === "number" ? errLike.position : -1,
        }
      }
    }
    return {
      type: "error",
      error: e instanceof Error ? e.message : "Unknown error",
      position: -1,
    }
  }
}
