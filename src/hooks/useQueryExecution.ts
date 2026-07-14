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

export const useQueryExecution = (globals?: NotebookVariable[]) => {
  const { quest } = useContext(QuestContext)

  const executeSingle = useCallback(
    (
      sql: string,
      signal?: AbortSignal,
      limit: number = RESULT_DISPLAY_LIMIT,
    ): Promise<QueryExecResult> =>
      executeSingleRaw(quest, sql, globals, signal, limit),
    [quest, globals],
  )

  return { executeSingle }
}
