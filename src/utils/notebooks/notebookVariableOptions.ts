import type { ValidateQueryResult } from "../questdb/types"
import type {
  DeclareEntry,
  NotebookSettings,
  NotebookVariable,
} from "../../store/notebook"
import {
  GLOBAL_OPTIONS_OWNER,
  loadStoredOptions,
  notebookOptionsOwner,
} from "../../store/notebookOptions"
import { declareEntriesAbove } from "../../scenes/Editor/Notebook/variables/declareEntries"
import {
  isQueryList,
  variableOptionsContext,
  type VariableValuesEntry,
} from "../../scenes/Editor/Notebook/variables/options/fetchVariableOptions"
import {
  listsAffectedByChange,
  listsAffectedByTimeRange,
} from "../../scenes/Editor/Notebook/variables/options/affectedLists"
import {
  prepareVariables,
  type PreparedVariables,
  type VariableErrors,
  type VariableStep,
} from "../../scenes/Editor/Notebook/variables/prepareVariables"
import { commitVariables } from "../../scenes/Editor/Notebook/variables/commitVariables"
import { isTimeVariableName } from "../../scenes/Editor/Notebook/variables/timeRange"
import { normalizeVariables } from "../../scenes/Editor/Notebook/variables/normalizeVariables"
import { getNotebookGlobals } from "../../store/notebookGlobals"
import type { Client } from "../questdb/client"
import { enqueueBufferTask } from "./notebookBufferQueue"
import { readNotebookView } from "./notebookDexieView"
import type { DexieControllerDeps } from "./notebookHeadlessRun"
import type { VariableSettingsDiff } from "./notebookController/notebookTransitions"

export type { VariableValuesEntry }

export type HeadlessDeclareEntries = {
  entries: DeclareEntry[]
  report: VariableValuesEntry[]
}

type Fetcher = {
  quest: Client | undefined
  signal: AbortSignal
  force: Set<string>
  validateAll: boolean
  previousErrors?: (owner: string) => VariableErrors
  validateSql?: (sql: string) => Promise<ValidateQueryResult>
  onStep?: (step: VariableStep) => void
}

const lower = (name: string) => name.toLowerCase()

const prepareScope = async (
  {
    quest,
    signal,
    force,
    validateAll,
    previousErrors,
    onStep,
    validateSql,
  }: Fetcher,
  owner: string,
  settings: NotebookSettings,
  prefixEntries: DeclareEntry[],
  prefixErrors: VariableErrors,
): Promise<PreparedVariables> => {
  const stored = await loadStoredOptions(owner)
  const options = Object.fromEntries(
    stored.map((row) => [
      row.name,
      {
        ...row,
        columns: [],
        truncated: false,
        warnings: [],
      },
    ]),
  )
  const refresh = (settings.variables ?? [])
    .filter(isQueryList)
    .filter((variable) => {
      const entries = declareEntriesAbove(
        settings,
        options,
        prefixEntries,
        variable.name,
      )
      return (
        force.has(lower(variable.name)) ||
        options[variable.name]?.context !==
          variableOptionsContext(variable, entries)
      )
    })
    .map((variable) => variable.name)
  return prepareVariables({
    quest,
    settings,
    prefixEntries,
    prefixErrors,
    options,
    errors: previousErrors?.(owner) ?? {},
    changed: [...force],
    refresh,
    signal,
    onStep,
    validateAll,
    validateSql,
  })
}

export type PreparedNotebookVariables = {
  global: PreparedVariables
  notebook: PreparedVariables
}

export const prepareNotebookVariables = async (
  fetcher: Fetcher,
  bufferId: number,
  settings: NotebookSettings,
  globals: NotebookVariable[],
): Promise<PreparedNotebookVariables> => {
  const global = await prepareScope(
    fetcher,
    GLOBAL_OPTIONS_OWNER,
    { variables: globals, timeRange: settings.timeRange },
    [],
    {},
  )
  const globalEntries = global.entries.filter(
    (entry) => !isTimeVariableName(entry.name),
  )
  const previousGlobalErrors = fetcher.previousErrors?.(GLOBAL_OPTIONS_OWNER)
  const repairedGlobals = Object.keys(previousGlobalErrors ?? {}).filter(
    (name) => !(name in global.errors),
  )
  const notebook = await prepareScope(
    {
      ...fetcher,
      force: new Set([...fetcher.force, ...repairedGlobals.map(lower)]),
    },
    notebookOptionsOwner(bufferId),
    settings,
    globalEntries,
    global.errors,
  )
  return { global, notebook }
}

export const commitNotebookVariables = async (
  bufferId: number,
  prepared: PreparedNotebookVariables,
  saveSettings: () => Promise<void>,
  signal: AbortSignal,
): Promise<void> => {
  await commitVariables(
    GLOBAL_OPTIONS_OWNER,
    prepared.global,
    () =>
      commitVariables(
        notebookOptionsOwner(bufferId),
        prepared.notebook,
        saveSettings,
        signal,
      ),
    signal,
  )
}

const resolveDeclareEntries = async (
  fetcher: Fetcher,
  bufferId: number,
  settings: NotebookSettings,
  globals: NotebookVariable[],
): Promise<HeadlessDeclareEntries> => {
  const prepared = await prepareNotebookVariables(
    fetcher,
    bufferId,
    settings,
    globals,
  )
  await enqueueBufferTask(bufferId, () =>
    commitNotebookVariables(
      bufferId,
      prepared,
      () => Promise.resolve(),
      fetcher.signal,
    ),
  )
  return {
    entries: prepared.notebook.entries,
    report: [...prepared.global.report, ...prepared.notebook.report],
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
    {
      quest: args.quest,
      signal: args.signal,
      force: new Set(),
      validateAll: true,
    },
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
      force: forcedByDiff([...globals, ...(settings.variables ?? [])], diff),
      validateAll: true,
    },
    bufferId,
    settings,
    globals,
  )
  return report
}
