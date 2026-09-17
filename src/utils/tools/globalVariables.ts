import { prepareVariables } from "../../scenes/Editor/Notebook/variables/prepareVariables"
import { commitVariables } from "../../scenes/Editor/Notebook/variables/commitVariables"
import { GLOBAL_OPTIONS_OWNER } from "../../store/notebookOptions"
import {
  getNotebookGlobals,
  GlobalsChangedError,
  replaceNotebookGlobals,
} from "../../store/notebookGlobals"
import { normalizeVariables } from "../../scenes/Editor/Notebook/variables/normalizeVariables"
import { globalNameConflict } from "../../scenes/Editor/Notebook/variables/globals/globalNameConflict"
import {
  draftProblem,
  isBlockingDraftProblem,
  draftsFromVariables,
  PROBLEM_MESSAGES,
} from "../../scenes/Editor/Notebook/variables/variableDrafts"
import { isValidTimeRange } from "../../scenes/Editor/Notebook/variables/timeRange"
import { fetchedValuesEntry } from "../../scenes/Editor/Notebook/variables/options/fetchVariableOptions"
import { getAgentQuest } from "../notebooks/notebookAIBridge"
import type { ValidateQueryResult } from "../questdb/types"
import {
  describeWireVariableError,
  storedVariableToWire,
  wireVariableToStored,
} from "./variablesWire"

const failure = (error_code: string, message: string) => ({
  is_error: true,
  content: JSON.stringify({ error_code, message }),
})

export const readGlobalVariables = async () => {
  const stored = await getNotebookGlobals()
  return {
    revision: stored?.revision ?? 0,
    variables: normalizeVariables(stored?.variables).map(storedVariableToWire),
  }
}

export const dispatchApplyGlobalVariables = async (
  input: unknown,
  validateSql: ((sql: string) => Promise<ValidateQueryResult>) | undefined,
  signal?: AbortSignal,
): Promise<{ content: string; is_error?: boolean }> => {
  const { variables, expected_revision, time_range } = (input ?? {}) as Record<
    string,
    unknown
  >
  if (variables === null) {
    return {
      content: JSON.stringify({
        applied: false,
        ...(await readGlobalVariables()),
      }),
    }
  }
  if (!Array.isArray(variables)) {
    return failure(
      "validation",
      "variables must be the complete ordered array, or null to preserve all globals.",
    )
  }
  if (
    typeof expected_revision !== "number" ||
    !Number.isSafeInteger(expected_revision) ||
    expected_revision < 0
  ) {
    return failure(
      "state_not_fetched",
      "Call get_global_variables and supply its revision as expected_revision before replacing globals.",
    )
  }
  const before = await getNotebookGlobals()
  if ((before?.revision ?? 0) !== expected_revision) {
    return failure("state_stale", new GlobalsChangedError().message)
  }
  if (time_range != null && !isValidTimeRange(time_range)) {
    return failure(
      "validation",
      "time_range must be null or valid {from, to} bounds for validating time-dependent globals.",
    )
  }
  for (const [index, variable] of variables.entries()) {
    const error = describeWireVariableError(variable)
    if (error) return failure("validation", `variables[${index}] ${error}.`)
  }
  const next = normalizeVariables(variables.map(wireVariableToStored))
  const drafts = draftsFromVariables(next, "global")
  for (const [index, { variable }] of drafts.entries()) {
    const problem = draftProblem(drafts, index)
    if (problem && isBlockingDraftProblem(problem))
      return failure(
        "validation",
        `Variable ${variable.name}: ${PROBLEM_MESSAGES[problem]}`,
      )
  }
  const conflict = await globalNameConflict(next)
  if (conflict) {
    return failure(
      "validation",
      `Variable ${conflict}: ${PROBLEM_MESSAGES.duplicateName}`,
    )
  }
  const quest = getAgentQuest()
  const validate =
    validateSql ??
    (quest ? (sql: string) => quest.validateQuery(sql, signal) : undefined)
  if (next.length > 0 && !validate) {
    return failure(
      "workspace_unavailable",
      "SQL validation is unavailable; globals have not been changed.",
    )
  }
  const timeRange = isValidTimeRange(time_range) ? time_range : undefined
  const prepared = await prepareVariables({
    quest,
    settings: { variables: next, timeRange },
    prefixEntries: [],
    options: {},
    errors: {},
    changed: next.map((variable) => variable.name),
    refresh: next.map((variable) => variable.name),
    signal: signal ?? new AbortController().signal,
    validateSql: validate,
  })
  try {
    let revision = expected_revision
    await commitVariables(
      GLOBAL_OPTIONS_OWNER,
      prepared,
      async () => {
        revision = await replaceNotebookGlobals(next, expected_revision, signal)
      },
      signal ?? new AbortController().signal,
    )
    // The provider's live query observes this write, refreshes changed lists,
    // and notifies mounted notebooks. Headless runs resolve their own context.
    return {
      content: JSON.stringify({
        applied: true,
        variable_errors: prepared.errors,
        revision,
        variables: next.map(storedVariableToWire),
        validated_variable_values: Object.entries(prepared.options).map(
          ([name, fetched]) => fetchedValuesEntry(name, fetched),
        ),
      }),
    }
  } catch (error) {
    if (error instanceof GlobalsChangedError)
      return failure("state_stale", error.message)
    throw error
  }
}
