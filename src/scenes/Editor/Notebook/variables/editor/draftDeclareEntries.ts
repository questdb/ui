import type { TimeRange } from "../../../../../store/notebook"
import { buildDeclareEntries, type ListOptionsByName } from "../declareEntries"
import type { VariableScope } from "../scope"
import {
  draftsInScope,
  variablesFromDrafts,
  type VariableDraft,
} from "../variableDrafts"
export type ScopedListOptions = Record<VariableScope, ListOptionsByName>
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
