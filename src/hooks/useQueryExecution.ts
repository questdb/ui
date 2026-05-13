import { useCallback, useContext } from "react"
import { QuestContext } from "../providers/QuestProvider"
import * as QuestDB from "../utils/questdb"
import type { ColumnDefinition, Timings } from "../utils/questdb/types"

export const RESULT_DISPLAY_LIMIT = 50_000

export type QueryExecResult = {
  type: "dql" | "ddl" | "dml" | "error"
  query: string
  columns: ColumnDefinition[]
  dataset: (boolean | string | number | null)[][]
  count: number
  timings?: Timings
  error?: string
}

export const useQueryExecution = () => {
  const { quest } = useContext(QuestContext)

  const executeSingle = useCallback(
    async (sql: string, signal?: AbortSignal): Promise<QueryExecResult> => {
      try {
        const { promise, queryId } = quest.queryRaw(sql, {
          limit: `0,${RESULT_DISPLAY_LIMIT}`,
          cancellable: true,
        })
        if (signal) {
          if (signal.aborted) {
            quest.abort(queryId)
          } else {
            signal.addEventListener("abort", () => quest.abort(queryId), {
              once: true,
            })
          }
        }
        const result = await promise

        if (result.type === QuestDB.Type.DQL) {
          return {
            type: "dql",
            query: sql,
            columns: result.columns,
            dataset: result.dataset,
            count: result.count,
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
    [quest],
  )

  return { executeSingle }
}
