import { useCallback, useContext } from "react"
import { QuestContext } from "../providers/QuestProvider"
import type { NotebookVariable } from "../store/notebook"
import {
  executeSingleRaw,
  RESULT_DISPLAY_LIMIT,
  type QueryExecResult,
} from "../utils/executeSingleRaw"

export {
  executeSingleRaw,
  RESULT_DISPLAY_LIMIT,
  type QueryExecResult,
} from "../utils/executeSingleRaw"

// Reads the variables when the query is sent, so a run started in the same
// event that changed them still declares them.
export const useQueryExecution = (
  getGlobals: () => NotebookVariable[] | undefined,
) => {
  const { quest } = useContext(QuestContext)

  const executeSingle = useCallback(
    (
      sql: string,
      signal?: AbortSignal,
      limit: number = RESULT_DISPLAY_LIMIT,
      options?: { background?: boolean },
    ): Promise<QueryExecResult> =>
      executeSingleRaw(quest, sql, getGlobals(), signal, limit, options),
    [quest, getGlobals],
  )

  return { executeSingle }
}
