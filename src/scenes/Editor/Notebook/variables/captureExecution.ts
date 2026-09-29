import type { DeclareEntry } from "../../../../store/notebook"
import type { Client } from "../../../../utils/questdb/client"
import {
  executeSingleRaw,
  RESULT_DISPLAY_LIMIT,
  type QueryExecResult,
} from "../../../../utils/executeSingleRaw"
import { createValidateWithGlobals } from "../declareUtils"
import { requireNotAborted } from "./prepareVariables"

export const captureExecution = async (
  quest: Client,
  ready: () => Promise<unknown>,
  read: () => DeclareEntry[],
  signal?: AbortSignal,
) => {
  await ready()
  if (signal) requireNotAborted(signal)
  const entries = read()
  const validate = createValidateWithGlobals(quest, () => entries)
  return {
    executeSingle: (
      sql: string,
      signal?: AbortSignal,
      limit = RESULT_DISPLAY_LIMIT,
    ): Promise<QueryExecResult> =>
      executeSingleRaw(quest, sql, entries, signal, limit),
    validateWithGlobals: validate,
  }
}
export type CapturedExecution = Awaited<ReturnType<typeof captureExecution>>
