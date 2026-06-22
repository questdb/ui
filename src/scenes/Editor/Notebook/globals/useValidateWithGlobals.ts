import { useCallback, useContext } from "react"
import { QuestContext } from "../../../../providers/QuestProvider"
import { useNotebookActions } from "../NotebookProvider"
import {
  mapWireErrorPosition,
  normalizeVariables,
  prependGlobalsDeclare,
} from "../declareUtils"

// Wraps quest.validateQuery so callers can pass the user's original SQL while
// the server sees the wire form (with notebook globals injected as a DECLARE
// block). When the server reports an error position, we translate it back to
// the original-SQL coordinate system so Monaco markers land on the user's
// typo, not on our injected DECLARE prefix.
export const useValidateWithGlobals = () => {
  const { quest } = useContext(QuestContext)
  const { getVariables } = useNotebookActions()

  return useCallback(
    async (sql: string, signal?: AbortSignal) => {
      const variables = normalizeVariables(getVariables())
      const prepared =
        variables.length > 0
          ? prependGlobalsDeclare(sql, variables)
          : { sql, insertedRange: null }
      const result = await quest.validateQuery(prepared.sql, signal)
      if (!("error" in result) || !prepared.insertedRange) return result
      const mapped = mapWireErrorPosition(
        prepared.insertedRange,
        result.position,
      )
      if (mapped.kind === "passthrough") return result
      if (mapped.kind === "inDeclareBlock") {
        return {
          ...result,
          position: mapped.position,
          error: `${result.error} (in DECLARE block)`,
        }
      }
      return { ...result, position: mapped.position }
    },
    [quest, getVariables],
  )
}
