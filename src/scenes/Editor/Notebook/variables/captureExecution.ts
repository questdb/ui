import type { DeclareEntry } from "../../../../store/notebook"
import type { Client } from "../../../../utils/questdb/client"
import {
  executeSingleRaw,
  RESULT_DISPLAY_LIMIT,
  type QueryExecResult,
} from "../../../../utils/executeSingleRaw"
import { createValidateWithGlobals } from "../declareUtils"
import { requireNotAborted } from "./prepareVariables"

const untilReadyOrAborted = (
  ready: () => Promise<unknown>,
  signal?: AbortSignal,
): Promise<void> => {
  if (!signal) return ready().then(() => undefined)
  return new Promise<void>((resolve, reject) => {
    const abort = () => reject(new DOMException("Aborted", "AbortError"))
    if (signal.aborted) return abort()
    signal.addEventListener("abort", abort, { once: true })
    ready()
      .then(() => resolve(), reject)
      .finally(() => signal.removeEventListener("abort", abort))
  })
}

export const captureExecution = async (
  quest: Client,
  ready: () => Promise<unknown>,
  read: () => DeclareEntry[],
  signal?: AbortSignal,
) => {
  await untilReadyOrAborted(ready, signal)
  if (signal) requireNotAborted(signal)
  const entries = read()
  const validate = createValidateWithGlobals(quest, () => entries)
  return {
    executeSingle: (
      sql: string,
      signal?: AbortSignal,
      limit = RESULT_DISPLAY_LIMIT,
      options?: { background?: boolean },
    ): Promise<QueryExecResult> =>
      executeSingleRaw(quest, sql, entries, signal, limit, options),
    validateWithGlobals: validate,
  }
}
export type CapturedExecution = Awaited<ReturnType<typeof captureExecution>>
