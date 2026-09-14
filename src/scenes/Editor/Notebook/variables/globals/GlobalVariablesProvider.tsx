import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { QuestContext } from "../../../../../providers/QuestProvider"
import type {
  DeclareEntry,
  NotebookVariable,
  TimeRange,
} from "../../../../../store/notebook"
import {
  getNotebookGlobals,
  saveNotebookGlobals,
} from "../../../../../store/notebookGlobals"
import { GLOBAL_OPTIONS_OWNER } from "../../../../../store/notebookOptions"
import { buildDeclareEntries } from "../declareEntries"
import { normalizeVariables } from "../normalizeVariables"
import type { PrefetchedVariableOptions } from "../options/fetchVariableOptions"
import { sameTimeRange } from "../timeRange"
import {
  useVariableOptions,
  type VariableOptionsByName,
} from "../useVariableOptions"
import {
  changedVariableNames,
  redefinedVariableNames,
} from "../variableChanges"

export type NotebookHandle = {
  getTimeRange: () => TimeRange | undefined
  onGlobalsChanged: (names: string[]) => void
}

export type GlobalVariablesState = {
  variables: NotebookVariable[]
  listOptions: VariableOptionsByName
}

export type GlobalVariablesActions = {
  getVariables: () => NotebookVariable[]
  getDeclareEntries: () => DeclareEntry[]
  applyVariables: (
    variables: NotebookVariable[],
    prefetched: PrefetchedVariableOptions,
    adoptedBy: number,
  ) => Promise<void>
  updateVariable: (
    name: string,
    update: (variable: NotebookVariable) => NotebookVariable,
  ) => Promise<void>
  refreshOptions: (name: string) => void
  attachNotebook: (bufferId: number, handle: NotebookHandle) => () => void
  noteTimeRangeChanged: () => void
}

const NO_PREFIX_ENTRIES = (): DeclareEntry[] => []

const EMPTY_STATE: GlobalVariablesState = { variables: [], listOptions: {} }

const NOOP_ACTIONS: GlobalVariablesActions = {
  getVariables: () => [],
  getDeclareEntries: () => [],
  applyVariables: () => Promise.resolve(),
  updateVariable: () => Promise.resolve(),
  refreshOptions: () => undefined,
  attachNotebook: () => () => undefined,
  noteTimeRangeChanged: () => undefined,
}

const StateContext = createContext<GlobalVariablesState>(EMPTY_STATE)
const ActionsContext = createContext<GlobalVariablesActions>(NOOP_ACTIONS)

export const useGlobalVariablesState = () => useContext(StateContext)
export const useGlobalVariablesActions = () => useContext(ActionsContext)

export const GlobalVariablesProvider: React.FC = ({ children }) => {
  const { quest } = useContext(QuestContext)
  const stored = useLiveQuery(getNotebookGlobals, [])

  const variablesRef = useRef<NotebookVariable[]>([])
  const previousRef = useRef<NotebookVariable[] | null>(null)
  const notebooksRef = useRef(new Map<number, NotebookHandle>())
  const activeBufferIdRef = useRef<number | null>(null)
  const fetchedRangeRef = useRef<TimeRange | undefined>(undefined)

  const loaded = stored !== undefined
  const variables = useMemo(
    () => normalizeVariables(stored?.variables),
    [stored],
  )

  const activeTimeRange = useCallback(() => {
    const bufferId = activeBufferIdRef.current
    return bufferId === null
      ? undefined
      : notebooksRef.current.get(bufferId)?.getTimeRange()
  }, [])

  const notify = useCallback((names: string[], except?: number) => {
    for (const [bufferId, handle] of notebooksRef.current) {
      if (bufferId !== except) handle.onGlobalsChanged(names)
    }
  }, [])

  const getSettings = useCallback(
    () => ({ variables: variablesRef.current, timeRange: activeTimeRange() }),
    [activeTimeRange],
  )
  const onRefetched = useCallback((name: string) => notify([name]), [notify])

  const {
    listOptions,
    listOptionsRef,
    refetch,
    load,
    refetchChanged,
    refetchForTimeRange,
    prune,
  } = useVariableOptions({
    quest,
    owner: GLOBAL_OPTIONS_OWNER,
    getSettings,
    getPrefixEntries: NO_PREFIX_ENTRIES,
    onRefetched,
  })

  const getDeclareEntries = useCallback(
    () =>
      buildDeclareEntries(
        { variables: variablesRef.current },
        listOptionsRef.current,
      ),
    [listOptionsRef],
  )

  const syncTimeRange = useCallback(() => {
    const range = activeTimeRange()
    if (sameTimeRange(range, fetchedRangeRef.current)) return
    fetchedRangeRef.current = range
    void refetchForTimeRange("change")
  }, [activeTimeRange, refetchForTimeRange])

  const attachNotebook = useCallback(
    (bufferId: number, handle: NotebookHandle) => {
      notebooksRef.current.set(bufferId, handle)
      activeBufferIdRef.current = bufferId
      syncTimeRange()
      return () => {
        notebooksRef.current.delete(bufferId)
        if (activeBufferIdRef.current === bufferId) {
          const remaining = [...notebooksRef.current.keys()]
          activeBufferIdRef.current = remaining[remaining.length - 1] ?? null
        }
      }
    },
    [syncTimeRange],
  )

  const applyVariables = useCallback(
    async (
      next: NotebookVariable[],
      prefetched: PrefetchedVariableOptions,
      adoptedBy: number,
    ) => {
      const previous = variablesRef.current
      const changed = changedVariableNames(previous, next)
      const redefined = redefinedVariableNames(previous, next)
      previousRef.current = next
      variablesRef.current = next
      if (changed.length > 0) {
        prune()
        void refetchChanged(changed, redefined, "change", prefetched)
        notify(changed, adoptedBy)
      }
      await saveNotebookGlobals(next)
    },
    [notify, prune, refetchChanged],
  )

  const updateVariable = useCallback(
    (name: string, update: (variable: NotebookVariable) => NotebookVariable) =>
      saveNotebookGlobals(
        variablesRef.current.map((variable) =>
          variable.name === name ? update(variable) : variable,
        ),
      ),
    [],
  )

  const refreshOptions = useCallback(
    (name: string) => void refetch([name], "change"),
    [refetch],
  )

  useEffect(() => {
    variablesRef.current = variables
  }, [variables])

  useEffect(() => {
    if (!loaded) return
    const previous = previousRef.current
    previousRef.current = variables
    if (previous === null) {
      fetchedRangeRef.current = activeTimeRange()
      void load()
      return
    }
    const changed = changedVariableNames(previous, variables)
    if (changed.length === 0) return
    prune()
    void refetchChanged(
      changed,
      redefinedVariableNames(previous, variables),
      "change",
    )
    notify(changed)
  }, [loaded, variables, activeTimeRange, notify, prune, load, refetchChanged])

  const stateValue = useMemo<GlobalVariablesState>(
    () => ({ variables, listOptions }),
    [variables, listOptions],
  )

  const actionsValue = useMemo<GlobalVariablesActions>(
    () => ({
      getVariables: () => variablesRef.current,
      getDeclareEntries,
      applyVariables,
      updateVariable,
      refreshOptions,
      attachNotebook,
      noteTimeRangeChanged: syncTimeRange,
    }),
    [
      getDeclareEntries,
      applyVariables,
      updateVariable,
      refreshOptions,
      attachNotebook,
      syncTimeRange,
    ],
  )

  return (
    <ActionsContext.Provider value={actionsValue}>
      <StateContext.Provider value={stateValue}>
        {children}
      </StateContext.Provider>
    </ActionsContext.Provider>
  )
}
