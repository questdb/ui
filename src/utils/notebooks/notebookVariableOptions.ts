import type {
  DeclareEntry,
  NotebookSettings,
  NotebookVariable,
} from "../../store/notebook"
import {
  GLOBAL_OPTIONS_OWNER,
  loadStoredOptions,
  notebookOptionsOwner,
  saveStoredOptions,
} from "../../store/notebookOptions"
import {
  buildDeclareEntries,
  declareEntriesAbove,
  type ListOptionsByName,
} from "../../scenes/Editor/Notebook/variables/declareEntries"
import {
  fetchedValuesEntry,
  fetchVariableOptions,
  isQueryList,
  requiresTimeRange,
  TIME_RANGE_REQUIRED,
  type VariableValuesEntry,
} from "../../scenes/Editor/Notebook/variables/options/fetchVariableOptions"
import {
  listsAffectedByChange,
  listsAffectedByTimeRange,
} from "../../scenes/Editor/Notebook/variables/options/affectedLists"
import { listOptionsFromStored } from "../../scenes/Editor/Notebook/variables/options/storedOptions"
import { normalizeVariables } from "../../scenes/Editor/Notebook/variables/normalizeVariables"
import { getNotebookGlobals } from "../../store/notebookGlobals"
import type { Client } from "../questdb/client"
import { enqueueBufferTask } from "./notebookBufferQueue"
import { readNotebookView } from "./notebookDexieView"
import type { DexieControllerDeps } from "./notebookHeadlessRun"
import type { VariableSettingsDiff } from "./notebookController/notebookTransitions"

export type { VariableValuesEntry }

const QUEST_UNAVAILABLE = "Notebook agent runtime is not ready yet."

export type HeadlessDeclareEntries = {
  entries: DeclareEntry[]
  report: VariableValuesEntry[]
}

type Fetcher = {
  quest: Client | undefined
  signal: AbortSignal
  force: Set<string>
}

const lower = (name: string) => name.toLowerCase()

const fetchMissingOptions = async (
  { quest, signal, force }: Fetcher,
  owner: string,
  settings: NotebookSettings,
  prefixEntries: DeclareEntry[],
  report: VariableValuesEntry[],
): Promise<ListOptionsByName> => {
  const options = listOptionsFromStored(await loadStoredOptions(owner))
  for (const variable of (settings.variables ?? []).filter(isQueryList)) {
    const { name } = variable
    if (options[name] && !force.has(lower(name))) continue
    if (!quest) {
      report.push({ name, error: QUEST_UNAVAILABLE })
      continue
    }
    if (!settings.timeRange && requiresTimeRange(variable)) {
      report.push({ name, error: TIME_RANGE_REQUIRED })
      continue
    }
    const result = await fetchVariableOptions(
      quest,
      variable,
      declareEntriesAbove(settings, options, prefixEntries, name),
      signal,
    )
    if (result.kind === "error") {
      report.push({ name, error: result.error })
      continue
    }
    const { fetched } = result
    options[name] = { options: fetched.options }
    await saveStoredOptions({
      owner,
      name,
      options: fetched.options,
      fetchedAt: fetched.fetchedAt,
    }).catch(() => undefined)
    report.push(fetchedValuesEntry(name, fetched))
  }
  return options
}

const resolveDeclareEntries = async (
  fetcher: Fetcher,
  bufferId: number,
  settings: NotebookSettings,
  globals: NotebookVariable[],
): Promise<HeadlessDeclareEntries> => {
  const report: VariableValuesEntry[] = []
  const globalOptions = await fetchMissingOptions(
    fetcher,
    GLOBAL_OPTIONS_OWNER,
    { variables: globals, timeRange: settings.timeRange },
    [],
    report,
  )
  const globalEntries = buildDeclareEntries(
    { variables: globals },
    globalOptions,
  )
  const localOptions = await fetchMissingOptions(
    fetcher,
    notebookOptionsOwner(bufferId),
    settings,
    globalEntries,
    report,
  )
  return {
    entries: buildDeclareEntries(settings, localOptions, globalEntries),
    report,
  }
}

export const resolveHeadlessDeclareEntries = (args: {
  bufferId: number
  quest: Client
  settings: NotebookSettings
  globals: NotebookVariable[]
  signal: AbortSignal
}): Promise<HeadlessDeclareEntries> =>
  resolveDeclareEntries(
    { quest: args.quest, signal: args.signal, force: new Set() },
    args.bufferId,
    args.settings,
    args.globals,
  )

const forcedByDiff = (
  variables: NotebookVariable[],
  diff: VariableSettingsDiff,
): Set<string> =>
  new Set(
    [
      ...listsAffectedByChange(variables, diff.changed, diff.redefined),
      ...(diff.timeRangeChanged ? listsAffectedByTimeRange(variables) : []),
    ].map((list) => lower(list.name)),
  )

export const syncHeadlessVariableOptions = async (
  bufferId: number,
  deps: DexieControllerDeps,
  diff: VariableSettingsDiff,
  signal: AbortSignal | undefined,
): Promise<VariableValuesEntry[]> => {
  const { settings, globals } = await enqueueBufferTask(bufferId, async () => ({
    settings: (await readNotebookView(bufferId)).settings ?? {},
    globals: normalizeVariables((await getNotebookGlobals())?.variables),
  }))
  const { report } = await resolveDeclareEntries(
    {
      quest: deps.getQuest(),
      signal: signal ?? new AbortController().signal,
      force: forcedByDiff(settings.variables ?? [], diff),
    },
    bufferId,
    settings,
    globals,
  )
  return report
}
