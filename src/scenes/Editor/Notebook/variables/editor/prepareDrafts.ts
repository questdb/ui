import { trackEvent } from "../../../../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../../../../modules/ConsoleEventTracker/events"
import type { TimeRange } from "../../../../../store/notebook"
import type { Client } from "../../../../../utils/questdb/client"
import { buildDeclareEntries, type ListOptionsByName } from "../declareEntries"
import { listsAffectedByChange } from "../options/affectedLists"
import {
  fetchVariableOptions,
  isQueryList,
  requiresTimeRange,
  TIME_RANGE_REQUIRED,
  type PrefetchedVariableOptions,
} from "../options/fetchVariableOptions"
import type { VariableScope } from "../scope"
import {
  draftsInScope,
  variablesFromDrafts,
  type VariableDraft,
} from "../variableDrafts"

export type ScopedListOptions = Record<VariableScope, ListOptionsByName>
export type ScopedPrefetchedOptions = Record<
  VariableScope,
  PrefetchedVariableOptions
>

export const draftDeclareEntries = (
  drafts: VariableDraft[],
  timeRange: TimeRange | undefined,
  options: ScopedListOptions,
) =>
  buildDeclareEntries(
    {
      timeRange,
      variables: variablesFromDrafts(draftsInScope(drafts, "notebook")),
    },
    options.notebook,
    buildDeclareEntries(
      { variables: variablesFromDrafts(draftsInScope(drafts, "global")) },
      options.global,
    ),
  )

export type DraftStep = { kind: "validating" | "fetching"; name: string }

export type DraftPreparation =
  | { kind: "ready"; prefetched: ScopedPrefetchedOptions }
  | { kind: "error"; name: string; error: string }

type Args = {
  quest: Client | undefined
  drafts: VariableDraft[]
  timeRange: TimeRange | undefined
  changed: string[]
  redefined: string[]
  options: ScopedListOptions
  signal: AbortSignal
  validate: (index: number, known: ScopedListOptions) => Promise<string | null>
  onStep: (step: DraftStep) => void
}

const lower = (name: string) => name.toLowerCase()

export const prepareDrafts = async ({
  quest,
  drafts,
  timeRange,
  changed,
  redefined,
  options,
  signal,
  validate,
  onStep,
}: Args): Promise<DraftPreparation> => {
  const affected = new Set(
    listsAffectedByChange(
      drafts.map((draft) => draft.variable),
      changed,
      redefined,
    ).map((list) => lower(list.name)),
  )
  const prefetched: ScopedPrefetchedOptions = { global: {}, notebook: {} }
  const known: ScopedListOptions = {
    global: { ...options.global },
    notebook: { ...options.notebook },
  }
  for (const [index, { variable, scope }] of drafts.entries()) {
    onStep({ kind: "validating", name: variable.name })
    const problem = await validate(index, known)
    if (problem) return { kind: "error", name: variable.name, error: problem }
    if (!isQueryList(variable) || !affected.has(lower(variable.name))) continue
    if (!quest) {
      return {
        kind: "error",
        name: variable.name,
        error: "Notebook agent runtime is not ready yet.",
      }
    }
    if (!timeRange && requiresTimeRange(variable)) {
      return { kind: "error", name: variable.name, error: TIME_RANGE_REQUIRED }
    }
    onStep({ kind: "fetching", name: variable.name })
    const result = await fetchVariableOptions(
      quest,
      variable,
      draftDeclareEntries(drafts.slice(0, index), timeRange, known),
      signal,
    )
    if (result.kind === "error") {
      void trackEvent(ConsoleEvent.NOTEBOOK_VARIABLE_OPTIONS_FETCH, {
        status: "error",
      })
      return { kind: "error", name: variable.name, error: result.error }
    }
    void trackEvent(ConsoleEvent.NOTEBOOK_VARIABLE_OPTIONS_FETCH, {
      status: "ready",
      truncated: result.fetched.truncated,
    })
    prefetched[scope][variable.name] = result.fetched
    known[scope][variable.name] = { options: result.fetched.options }
  }
  return { kind: "ready", prefetched }
}
