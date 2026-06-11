import { useCallback, useContext } from "react"
import { QuestContext } from "../../../../providers/QuestProvider"
import { useNotebookActions } from "../NotebookProvider"
import { normalizeVariables, prependGlobalsDeclare } from "../declareUtils"

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
      const { start, end, delta } = prepared.insertedRange
      const { position } = result
      if (position < start) {
        // Error landed in the leading trivia BEFORE our insertion point.
        // Coordinates already match the user's SQL — pass through.
        return result
      }
      if (position < end) {
        // Error is inside the wire DECLARE block. For a bare-SELECT cell
        // this is purely our injected content; for a merge it may also be
        // inside the user's own local assignment. Positions inside the
        // block can't be back-mapped uniformly (separator rewrites shift
        // them non-linearly), so we point the marker at the block start
        // and annotate. The underlying server message still describes the
        // root cause.
        return {
          ...result,
          position: start,
          error: `${result.error} (in DECLARE block)`,
        }
      }
      // Error after the wire DECLARE block — simple shift back into
      // user-SQL coordinates.
      return { ...result, position: position - delta }
    },
    [quest, getVariables],
  )
}
