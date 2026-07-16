import type { Client } from "../questdb/client"
import { Type } from "../questdb/types"

export const RUN_QUERY_DEFAULT_LIMIT = 100
export const RUN_QUERY_MAX_LIMIT = 10_000
const RUN_QUERY_PAYLOAD_BYTE_CAP = 1_000_000

export type RunQueryRawResult =
  | {
      type: "dql"
      columns: Array<{ name: string; type?: string }>
      dataset: Array<Array<unknown>>
      count: number
      durationMs?: number
      notice?: string
    }
  | { type: "ddl" | "dml" | "notice"; durationMs?: number; message?: string }
  | { type: "error"; error: string; position?: number }

// Wire shape is (string | number | boolean | null)[] — array/object cells
// (e.g. QuestDB ARRAY columns) get flattened to a JSON string so the agent
// never has to handle nested structures in tool results.
const flattenCellValue = (raw: unknown): string | number | boolean | null => {
  if (raw === null || raw === undefined) return null
  if (typeof raw === "number" || typeof raw === "boolean") return raw
  if (typeof raw === "string") return raw
  return JSON.stringify(raw)
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
  const rowsCapped = raw.dataset
    .slice(0, limit)
    .map((row) => row.map(flattenCellValue))

  // Single-pass byte-budget aggregator: append rows while keeping the
  // cumulative JSON size under the cap. Strict — the row that would push
  // us over is dropped, not included. Exception: always keep the first
  // row so a pathological wide row doesn't return `rows: []`.
  const rows: typeof rowsCapped = []
  let bytes = 0
  let byteCapped = false
  for (const row of rowsCapped) {
    const rowBytes = JSON.stringify(row).length
    if (rows.length > 0 && bytes + rowBytes > RUN_QUERY_PAYLOAD_BYTE_CAP) {
      byteCapped = true
      break
    }
    rows.push(row)
    bytes += rowBytes
  }

  const rowCountClipped = totalCount > rowsCapped.length
  return {
    type: "dql",
    columns: raw.columns,
    rows,
    returned_count: rows.length,
    total_count: totalCount,
    truncated: rowCountClipped || byteCapped,
    duration_ms: raw.durationMs ?? null,
    ...(raw.notice !== undefined ? { notice: raw.notice } : {}),
  }
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
  let cleanup: (() => void) | undefined
  try {
    const limit = clampRunQueryLimit(requestedLimit)
    if (signal?.aborted) {
      return { type: "error", error: "Query aborted before execution." }
    }
    const { promise, queryId } = questClient.queryRaw(sql, {
      limit: `0,${limit}`,
      cancellable: true,
    })
    if (signal) {
      const onAbort = () => questClient.abort(queryId)
      signal.addEventListener("abort", onAbort, { once: true })
      cleanup = () => signal.removeEventListener("abort", onAbort)
    }
    const res = await promise
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
      if (res.columns && res.columns.length > 0) {
        return {
          type: "dql",
          columns: res.columns,
          dataset: res.dataset ?? [],
          count: res.count ?? 0,
          durationMs,
          notice: res.notice,
        }
      }
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
  } finally {
    cleanup?.()
  }
}
