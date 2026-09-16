import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
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
  replaceNotebookGlobals,
} from "../../../../../store/notebookGlobals"
import { GLOBAL_OPTIONS_OWNER } from "../../../../../store/notebookOptions"
import { buildDeclareEntries } from "../declareEntries"
import { normalizeVariables } from "../normalizeVariables"
import type { PreparedVariables, VariableErrors } from "../prepareVariables"
import { sameTimeRange } from "../timeRange"
import {
  useVariableOptions,
  showVariableUpdateError,
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
  errors: VariableErrors
  revision: number
}

export type GlobalVariablesActions = {
  getVariables: () => NotebookVariable[]
  getDeclareEntries: () => DeclareEntry[]
  getErrors: () => VariableErrors
  settle: () => Promise<unknown>
  adoptVariables: (
    variables: NotebookVariable[],
    prepared: PreparedVariables,
    adoptedBy: number,
  ) => void
  updateVariable: (
    name: string,
    update: (variable: NotebookVariable) => NotebookVariable,
  ) => void
  refreshOptions: (name: string) => void
  attachNotebook: (bufferId: number, handle: NotebookHandle) => () => void
}

const NO_PREFIX_ENTRIES = (): DeclareEntry[] => []

const EMPTY_STATE: GlobalVariablesState = {
  variables: [],
  listOptions: {},
  errors: {},
  revision: 0,
}

const NOOP_ACTIONS: GlobalVariablesActions = {
  getVariables: () => [],
  getDeclareEntries: () => [],
  getErrors: () => ({}),
  settle: () => Promise.resolve(),
  adoptVariables: () => undefined,
  updateVariable: () => undefined,
  refreshOptions: () => undefined,
  attachNotebook: () => () => undefined,
}

const StateContext = createContext<GlobalVariablesState>(EMPTY_STATE)
const ActionsContext = createContext<GlobalVariablesActions>(NOOP_ACTIONS)

export const useGlobalVariablesState = () => useContext(StateContext)
export const useGlobalVariablesActions = () => useContext(ActionsContext)

export const GlobalVariablesProvider: React.FC = ({ children }) => {
  const { quest } = useContext(QuestContext)
  const stored = useLiveQuery(getNotebookGlobals, [])

  const [definitions, setDefinitions] = useState<{
    variables: NotebookVariable[]
    revision: number
  }>({ variables: [], revision: 0 })

  const variablesRef = useRef<NotebookVariable[]>([])
  const revisionRef = useRef(0)
  const previousRef = useRef<NotebookVariable[] | null>(null)
  const notebooksRef = useRef(new Map<number, NotebookHandle>())
  const activeBufferIdRef = useRef<number | null>(null)
  const fetchedRangeRef = useRef<TimeRange | undefined>(undefined)

  const loaded = stored !== undefined
  const storedVariables = useMemo(
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
    if (names.length === 0) return
    for (const [bufferId, handle] of notebooksRef.current) {
      if (bufferId !== except) handle.onGlobalsChanged(names)
    }
  }, [])

  const getSettings = useCallback(
    () => ({ variables: variablesRef.current, timeRange: activeTimeRange() }),
    [activeTimeRange],
  )
  const onRefetched = useCallback((names: string[]) => notify(names), [notify])

  const {
    listOptions,
    listOptionsRef,
    errors,
    getErrors,
    settle,
    apply,
    adopt,
    refetchWithDependents,
    load,
    refetchChanged,
    refetchForTimeRange,
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
        {
          variables: variablesRef.current.filter(
            (variable) => !getErrors()[variable.name],
          ),
        },
        listOptionsRef.current,
      ),
    [listOptionsRef, getErrors],
  )

  const syncTimeRange = useCallback(() => {
    const range = activeTimeRange()
    if (sameTimeRange(range, fetchedRangeRef.current)) return
    fetchedRangeRef.current = range
    void refetchForTimeRange().catch(showVariableUpdateError)
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

  const adoptVariables = useCallback(
    (
      next: NotebookVariable[],
      prepared: PreparedVariables,
      adoptedBy: number,
    ) => {
      const changed = changedVariableNames(variablesRef.current, next)
      previousRef.current = next
      variablesRef.current = next
      setDefinitions((current) => ({ ...current, variables: next }))
      adopt(prepared)
      fetchedRangeRef.current = prepared.settings.timeRange
      notify(
        [...changed, ...prepared.report.map((entry) => entry.name)],
        adoptedBy,
      )
    },
    [adopt, notify],
  )

  const updateVariable = useCallback(
    (
      name: string,
      update: (variable: NotebookVariable) => NotebookVariable,
    ) => {
      let expectedRevision = 0
      let committedRevision = 0
      void apply(
        () => {
          expectedRevision = revisionRef.current
          return {
            variables: variablesRef.current.map((variable) =>
              variable.name === name ? update(variable) : variable,
            ),
            timeRange: activeTimeRange(),
          }
        },
        {
          saveSettings: async (prepared) => {
            committedRevision = await replaceNotebookGlobals(
              prepared.settings.variables ?? [],
              expectedRevision,
            )
          },
          onCommit: (prepared) => {
            const next = prepared.settings.variables ?? []
            previousRef.current = next
            variablesRef.current = next
            revisionRef.current = committedRevision
            setDefinitions({ variables: next, revision: committedRevision })
          },
        },
      ).catch(showVariableUpdateError)
    },
    [apply, activeTimeRange],
  )

  const refreshOptions = useCallback(
    (name: string) =>
      void refetchWithDependents(name).catch(showVariableUpdateError),
    [refetchWithDependents],
  )

  useEffect(() => {
    if (!loaded) return
    const revision = stored?.revision ?? 0
    variablesRef.current = storedVariables
    revisionRef.current = revision
    setDefinitions({ variables: storedVariables, revision })
  }, [loaded, storedVariables, stored?.revision])

  useEffect(() => {
    if (!loaded) return
    const previous = previousRef.current
    previousRef.current = storedVariables
    if (previous === null) {
      fetchedRangeRef.current = activeTimeRange()
      void load()
      return
    }
    const changed = changedVariableNames(previous, storedVariables)
    if (changed.length === 0) return
    void refetchChanged(
      changed,
      redefinedVariableNames(previous, storedVariables),
    ).catch(showVariableUpdateError)
    notify(changed)
  }, [loaded, storedVariables, activeTimeRange, notify, load, refetchChanged])

  const stateValue = useMemo<GlobalVariablesState>(
    () => ({ ...definitions, listOptions, errors }),
    [definitions, listOptions, errors],
  )

  const actionsValue = useMemo<GlobalVariablesActions>(
    () => ({
      getVariables: () => variablesRef.current,
      getDeclareEntries,
      getErrors,
      settle,
      adoptVariables,
      updateVariable,
      refreshOptions,
      attachNotebook,
    }),
    [
      getDeclareEntries,
      getErrors,
      settle,
      adoptVariables,
      updateVariable,
      refreshOptions,
      attachNotebook,
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
