import { useCallback, useContext } from "react"
import { QuestContext } from "../providers/QuestProvider"
import * as QuestDB from "../utils/questdb"
import type { ColumnDefinition, Timings } from "../utils/questdb/types"
import {
  normalizeVariables,
  prependGlobalsDeclare,
} from "../scenes/Editor/Notebook/declareUtils"
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
}

export const useQueryExecution = (globals?: NotebookVariable[]) => {
  const { quest } = useContext(QuestContext)

  const executeSingle = useCallback(
    async (
      sql: string,
      signal?: AbortSignal,
      limit: number = RESULT_DISPLAY_LIMIT,
    ): Promise<QueryExecResult> => {
      const normalized = normalizeVariables(globals)
      const expanded =
        normalized.length > 0 ? prependGlobalsDeclare(sql, normalized).sql : sql
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
        const { promise, queryId } = quest.queryRaw(expanded, {
          limit: `0,${limit}`,
          cancellable: true,
        })
        if (signal) {
          signal.addEventListener("abort", () => quest.abort(queryId), {
            once: true,
          })
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
            (err?.error as string) ??
            (err?.message as string) ??
            "Unknown error",
        }
      }
    },
    [quest, globals],
  )

  return { executeSingle }
}
