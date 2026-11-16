import * as QuestDB from "./questdb"
import type { Client } from "./questdb/client"
import type { ColumnDefinition, Timings } from "./questdb/types"
import {
  effectiveQueryOf,
  mapVariablesError,
  renderVariablesParameter,
} from "../scenes/Editor/Notebook/declareUtils"
import type { NotebookVariable } from "../store/notebook"
import {
  sessionFailureOf,
  type SessionFailure,
} from "../modules/OAuth2/session"

export const RESULT_DISPLAY_LIMIT = 50_000

export type QueryExecResult = SessionFailure & {
  type: "dql" | "ddl" | "dml" | "error"
  query: string
  effectiveQuery?: string
  columns: ColumnDefinition[]
  dataset: (boolean | string | number | null)[][]
  count: number
  timestamp?: number
  timings?: Timings
  error?: string
  notice?: string
}

// Context-free single-query execution: runs one statement through the quest
// client with the notebook variables in the `variables` parameter, and maps the
// raw response to QueryExecResult.
// Kept out of useQueryExecution (which pulls React/QuestProvider) so the
// headless notebook run path can reuse the exact same mapping with no React.
export const executeSingleRaw = async (
  quest: Client,
  sql: string,
  globals: NotebookVariable[] | undefined,
  signal?: AbortSignal,
  limit: number = RESULT_DISPLAY_LIMIT,
  options: { background?: boolean } = {},
): Promise<QueryExecResult> => {
  let cleanup: (() => void) | undefined
  const variables = renderVariablesParameter(globals)
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
    const effectiveQuery = effectiveQueryOf(sql, variables)
    const { promise, queryId } = quest.queryRaw(sql, {
      limit: `0,${limit}`,
      cancellable: true,
      ...(variables ? { variables: variables.text } : {}),
      ...(options.background ? { background: true } : {}),
    })
    if (signal) {
      const onAbort = () => quest.abort(queryId)
      signal.addEventListener("abort", onAbort, { once: true })
      cleanup = () => signal.removeEventListener("abort", onAbort)
    }
    // Normalize adapters/test doubles that resolve errors to the client's
    // usual rejection contract, so one catch formats every failure.
    const result = await promise.then((result) =>
      result.type === QuestDB.Type.ERROR ? Promise.reject(result) : result,
    )

    if (result.type === QuestDB.Type.DQL) {
      return {
        type: "dql",
        query: sql,
        effectiveQuery,
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
        effectiveQuery,
        columns: result.columns ?? [],
        dataset: result.dataset ?? [],
        count: result.count ?? 0,
        timestamp: result.timestamp,
        timings: result.timings,
        notice: result.notice,
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
    const message =
      (err?.error as string) ?? (err?.message as string) ?? "Unknown error"
    return {
      type: "error",
      query: sql,
      columns: [],
      dataset: [],
      count: 0,
      // an error in the variables names the variable
      error:
        err?.errorSource === "variables"
          ? mapVariablesError(variables, {
              error: message,
              position: typeof err.position === "number" ? err.position : -1,
              errorSource: "variables",
            }).error
          : message,
      ...sessionFailureOf(e),
    }
  } finally {
    cleanup?.()
  }
}
