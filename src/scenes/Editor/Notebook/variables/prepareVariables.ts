import { classifyOptionQuery } from "./options/classifyOptionQuery"
import type { DeclareEntry, NotebookSettings } from "../../../../store/notebook"
import type { Client } from "../../../../utils/questdb/client"
import type { ValidateQueryResult } from "../../../../utils/questdb/types"
import { renderDeclareValidationQuery } from "../declareUtils"
import { variableToDeclareEntry } from "./declareEntries"
import {
  fetchedValuesEntry,
  fetchVariableOptions,
  requiresTimeRange,
  TIME_RANGE_REQUIRED,
  isQueryList,
  type PrefetchedVariableOptions,
  type VariableValuesEntry,
} from "./options/fetchVariableOptions"
import {
  referencedDeclareEntries,
  referencesAny,
  variableReferences,
} from "./references"
import { isLiteralListSelection, variablePrecheck } from "./queryChecks"
import { timeRangeToDeclareEntries } from "./timeRange"
import {
  draftProblem,
  draftsFromVariables,
  isBlockingDraftProblem,
  PROBLEM_MESSAGES,
} from "./variableDrafts"

export type VariableErrors = Record<string, string>
export type VariableStep = {
  kind: "validating" | "fetching" | "committing"
  name: string
}
export type PreparedVariables = {
  settings: NotebookSettings
  options: PrefetchedVariableOptions
  errors: VariableErrors
  entries: DeclareEntry[]
  report: VariableValuesEntry[]
}
export type PrepareVariablesArgs = {
  quest: Client | undefined
  settings: NotebookSettings
  prefixEntries: DeclareEntry[]
  options: PrefetchedVariableOptions
  errors: VariableErrors
  changed: string[]
  refresh: string[]
  signal: AbortSignal
  validateAll?: boolean
  prefixErrors?: VariableErrors
  validateSql?: (sql: string) => Promise<ValidateQueryResult>
  onStep?: (step: VariableStep) => void
}

export const requireNotAborted = (signal: AbortSignal): void => {
  if (signal.aborted) throw new DOMException("Aborted", "AbortError")
}

const ownRecord = <T>(record: Record<string, T>): Record<string, T> =>
  Object.assign(Object.create(null) as Record<string, T>, record)

export const prepareVariables = async ({
  quest,
  settings,
  prefixEntries,
  options: staleOptions,
  errors: staleErrors,
  changed,
  refresh,
  signal,
  prefixErrors = {},
  validateAll = false,
  validateSql,
  onStep,
}: PrepareVariablesArgs): Promise<PreparedVariables> => {
  requireNotAborted(signal)
  const variables = settings.variables ?? []
  const drafts = draftsFromVariables(variables, "notebook")
  const previousOptions = ownRecord(staleOptions)
  const previousErrors = ownRecord(staleErrors)
  const options: PrefetchedVariableOptions = ownRecord({})
  const errors: VariableErrors = ownRecord({})
  const report: VariableValuesEntry[] = []
  const affected = new Set(
    [...changed, ...refresh].map((name) => name.toLowerCase()),
  )
  const refreshNames = new Set(refresh.map((name) => name.toLowerCase()))
  const entries = [
    ...(settings.timeRange
      ? timeRangeToDeclareEntries(settings.timeRange)
      : []),
    ...prefixEntries,
  ]
  const failed = new Map(
    Object.entries(prefixErrors).map(([name, error]) => [
      name.toLowerCase(),
      error,
    ]),
  )
  const validate =
    validateSql ??
    (quest ? (sql: string) => quest.validateQuery(sql, signal) : undefined)

  for (const [index, variable] of variables.entries()) {
    requireNotAborted(signal)
    const { name } = variable
    const references = variableReferences(variable)
    const dependencyChanged = [...references].some((ref) => affected.has(ref))
    const needsCheck = affected.has(name.toLowerCase()) || dependencyChanged
    const needsFetch =
      isQueryList(variable) &&
      (refreshNames.has(name.toLowerCase()) ||
        !previousOptions[name] ||
        referencesAny(variable.source.query, affected))
    const usesAllQueryOptions =
      isQueryList(variable) &&
      variable.selected === "all" &&
      variable.all.mode === "list"
    const reusesSelection =
      isQueryList(variable) &&
      variable.selected !== "all" &&
      needsCheck &&
      !refreshNames.has(name.toLowerCase()) &&
      !dependencyChanged &&
      !previousErrors[name] &&
      !needsFetch &&
      isLiteralListSelection(variable.selected)
    if (needsCheck) affected.add(name.toLowerCase())
    const problem = draftProblem(drafts, index)
    if (problem && isBlockingDraftProblem(problem))
      throw new Error(`@${name}: ${PROBLEM_MESSAGES[problem]}`)
    const dependency = [...references].find((ref) => failed.has(ref))
    let error = dependency
      ? `Cannot validate because @${dependency} failed.`
      : undefined
    if (!needsCheck && !error) error = previousErrors[name]
    if (previousOptions[name]) options[name] = previousOptions[name]
    if ((needsCheck || validateAll) && !error) {
      onStep?.({ kind: "validating", name })
      error =
        (problem
          ? PROBLEM_MESSAGES[problem]
          : variablePrecheck(variable, {
              declaredAbove: entries.map((entry) => entry.name),
              hasTimeRange: settings.timeRange !== undefined,
            })) ?? undefined
      if (
        isQueryList(variable) &&
        !settings.timeRange &&
        requiresTimeRange(variable)
      )
        error = TIME_RANGE_REQUIRED
      try {
        if (!error && isQueryList(variable) && needsFetch) {
          delete options[name]
          if (!quest) {
            const verdict = validate
              ? await classifyOptionQuery(
                  variable.source.query,
                  entries,
                  validate,
                )
              : null
            error =
              verdict && !verdict.ok
                ? verdict.error
                : "Notebook agent runtime is not ready yet."
          } else {
            onStep?.({ kind: "fetching", name })
            const result = await fetchVariableOptions(
              quest,
              variable,
              entries,
              signal,
            )
            requireNotAborted(signal)
            if (result.kind === "error") error = result.error
            else options[name] = result.fetched
          }
        }
        if (!error) {
          const entry = variableToDeclareEntry(variable, options)
          if (entry && !usesAllQueryOptions && !reusesSelection) {
            if (!validate) error = "SQL validation is unavailable."
            else {
              const dependencies = referencedDeclareEntries(
                entry.value,
                entries,
              )
              const verdict = await validate(
                renderDeclareValidationQuery([...dependencies, entry]),
              )
              requireNotAborted(signal)
              if ("error" in verdict) error = verdict.error
            }
          }
        }
      } catch (cause) {
        requireNotAborted(signal)
        error =
          cause instanceof Error ? cause.message : "Variable validation failed."
      }
    }
    if (error) {
      errors[name] = error
      failed.set(name.toLowerCase(), error)
      delete options[name]
      report.push({ name, error })
      continue
    }
    const entry = variableToDeclareEntry(variable, options)
    if (entry) entries.push(entry)
    if (needsFetch && isQueryList(variable) && options[name])
      report.push(fetchedValuesEntry(name, options[name]))
  }
  requireNotAborted(signal)
  return { settings, options, errors, entries, report }
}
