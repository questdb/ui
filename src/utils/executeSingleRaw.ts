import * as QuestDB from "./questdb"
import type { Client } from "./questdb/client"
import type { ColumnDefinition, Timings } from "./questdb/types"
import { expandGlobals } from "../scenes/Editor/Notebook/declareUtils"
import type { NotebookVariable } from "../store/notebook"

export const RESULT_DISPLAY_LIMIT = 50_000

export type QueryExecResult = {
  type: "dql" | "ddl" | "dml" | "error"
  query: string
  columns: ColumnDefinition[]
  dataset: (boolean | string | number | null)[][]
  count: number
  timestamp?: number
  timings?: Timings
  error?: string
  notice?: string
}

// Context-free single-query execution: runs one statement through the quest
// client, expanding globals and mapping the raw response to QueryExecResult.
// Kept out of useQueryExecution (which pulls React/QuestProvider) so the
// headless notebook run path can reuse the exact same mapping with no React.
export const executeSingleRaw = async (
  quest: Client,
  sql: string,
  globals: NotebookVariable[] | undefined,
  signal?: AbortSignal,
  limit: number = RESULT_DISPLAY_LIMIT,
): Promise<QueryExecResult> => {
  let cleanup: (() => void) | undefined
  try {
    if (signal?.aborted) {
      return {
        type: "error",
        query: sql,
        columns: [],
        dataset: [],
        count: 0,
        error: "Query aborted before execution.",
      }
    }
    const expanded = expandGlobals(sql, globals)
    const { promise, queryId } = quest.queryRaw(expanded, {
      limit: `0,${limit}`,
      cancellable: true,
    })
    if (signal) {
      const onAbort = () => quest.abort(queryId)
      signal.addEventListener("abort", onAbort, { once: true })
      cleanup = () => signal.removeEventListener("abort", onAbort)
    }
    const result = await promise

    if (result.type === QuestDB.Type.DQL) {
      return {
        type: "dql",
        query: sql,
        columns: result.columns,
        dataset: result.dataset,
        count: result.count,
        timestamp: result.timestamp,
        timings: result.timings,
      }
    }

    if (result.type === QuestDB.Type.NOTICE) {
      return {
        type: "dql",
        query: sql,
        columns: result.columns ?? [],
        dataset: result.dataset ?? [],
        count: result.count ?? 0,
        timestamp: result.timestamp,
        timings: result.timings,
        notice: result.notice,
      }
    }

    if (result.type === QuestDB.Type.ERROR) {
      return {
        type: "error",
        query: sql,
        columns: [],
        dataset: [],
        count: 0,
        error: result.error,
      }
    }

    return {
      type: result.type === QuestDB.Type.DDL ? "ddl" : "dml",
      query: sql,
      columns: [],
      dataset: [],
      count: 0,
    }
  } catch (e: unknown) {
    const err = e as Record<string, unknown> | null
    return {
      type: "error",
      query: sql,
      columns: [],
      dataset: [],
      count: 0,
      error:
        (err?.error as string) ?? (err?.message as string) ?? "Unknown error",
    }
  } finally {
    cleanup?.()
  }
}
