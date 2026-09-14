import { useCallback, useEffect, useRef, useState } from "react"
import type { DeclareEntry, NotebookSettings } from "../../../../store/notebook"
import {
  deleteStoredOptions,
  loadStoredOptions,
  saveStoredOptions,
  type StoredVariableOptions,
} from "../../../../store/notebookOptions"
import { ConsoleEvent } from "../../../../modules/ConsoleEventTracker/events"
import { trackEvent } from "../../../../modules/ConsoleEventTracker"
import type { Client } from "../../../../utils/questdb/client"
import { declareEntriesAbove, type ListOptionsState } from "./declareEntries"
import {
  listsAffectedByChange,
  listsAffectedByTimeRange,
} from "./options/affectedLists"
import {
  fetchedValuesEntry,
  fetchVariableOptions,
  isQueryList,
  requiresTimeRange,
  TIME_RANGE_REQUIRED,
  type PrefetchedVariableOptions,
  type QueryListVariable,
  type VariableValuesEntry,
} from "./options/fetchVariableOptions"

export type VariableOptionsStatus = "loading" | "ready" | "error"

export type VariableOptionsState = ListOptionsState & {
  status: VariableOptionsStatus
  columns: string[]
  fetchedAt?: number
  truncated: boolean
  warnings: string[]
  error?: string
}

export type VariableOptionsByName = Record<string, VariableOptionsState>

export type RefetchCause = "load" | "change"

const EMPTY_STATE: VariableOptionsState = {
  status: "loading",
  options: [],
  columns: [],
  truncated: false,
  warnings: [],
}

const lower = (name: string) => name.toLowerCase()

const sameSource = (a: QueryListVariable, b: QueryListVariable): boolean =>
  JSON.stringify(a.source) === JSON.stringify(b.source)

const seedState = (
  current: VariableOptionsState | undefined,
  row: StoredVariableOptions,
): VariableOptionsState => {
  if (current === undefined) {
    return {
      ...EMPTY_STATE,
      status: "ready",
      options: row.options,
      fetchedAt: row.fetchedAt,
    }
  }
  if (current.fetchedAt !== undefined) return current
  return { ...current, options: row.options, fetchedAt: row.fetchedAt }
}

type Args = {
  quest: Client
  owner: string
  getSettings: () => NotebookSettings
  getPrefixEntries: () => DeclareEntry[]
  onRefetched?: (name: string) => void
}

export const useVariableOptions = ({
  quest,
  owner,
  getSettings,
  getPrefixEntries,
  onRefetched,
}: Args) => {
  const [listOptions, setListOptions] = useState<VariableOptionsByName>({})
  const listOptionsRef = useRef<VariableOptionsByName>({})
  const abortsRef = useRef(new Map<string, AbortController>())
  const inFlightRef = useRef(new Set<Promise<VariableValuesEntry[]>>())

  const commit = useCallback((next: VariableOptionsByName) => {
    listOptionsRef.current = next
    setListOptions(next)
  }, [])

  const variables = useCallback(
    () => getSettings().variables ?? [],
    [getSettings],
  )
  const queryLists = useCallback(
    () => variables().filter(isQueryList),
    [variables],
  )

  const track = useCallback((work: Promise<VariableValuesEntry[]>) => {
    inFlightRef.current.add(work)
    void work.finally(() => inFlightRef.current.delete(work))
    return work
  }, [])

  const runRefetch = useCallback(
    async (
      names: Iterable<string>,
      cause: RefetchCause,
    ): Promise<VariableValuesEntry[]> => {
      const wanted = new Set([...names].map(lower))
      const report: VariableValuesEntry[] = []
      const patch = (name: string, state: Partial<VariableOptionsState>) =>
        commit({
          ...listOptionsRef.current,
          [name]: {
            ...(listOptionsRef.current[name] ?? EMPTY_STATE),
            ...state,
          },
        })
      for (const planned of queryLists()) {
        const { name } = planned
        if (!wanted.has(lower(name))) continue
        const variable = queryLists().find((list) => list.name === name)
        if (!variable || !sameSource(variable, planned)) continue
        abortsRef.current.get(name)?.abort()
        const controller = new AbortController()
        abortsRef.current.set(name, controller)
        if (!getSettings().timeRange && requiresTimeRange(variable)) {
          patch(name, { status: "error", error: TIME_RANGE_REQUIRED })
          report.push({ name, error: TIME_RANGE_REQUIRED })
          continue
        }
        patch(name, { status: "loading", error: undefined })
        const result = await fetchVariableOptions(
          quest,
          variable,
          declareEntriesAbove(
            getSettings(),
            listOptionsRef.current,
            getPrefixEntries(),
            name,
          ),
          controller.signal,
        )
        if (controller.signal.aborted) continue
        if (result.kind === "error") {
          patch(name, { status: "error", error: result.error })
          report.push({ name, error: result.error })
          void trackEvent(ConsoleEvent.NOTEBOOK_VARIABLE_OPTIONS_FETCH, {
            status: "error",
          })
          continue
        }
        patch(name, { status: "ready", ...result.fetched, error: undefined })
        void trackEvent(ConsoleEvent.NOTEBOOK_VARIABLE_OPTIONS_FETCH, {
          status: "ready",
          truncated: result.fetched.truncated,
        })
        await saveStoredOptions({
          owner,
          name,
          options: result.fetched.options,
          fetchedAt: result.fetched.fetchedAt,
        }).catch(() => undefined)
        report.push(fetchedValuesEntry(name, result.fetched))
        if (cause === "change") onRefetched?.(name)
      }
      return report
    },
    [
      commit,
      getPrefixEntries,
      getSettings,
      onRefetched,
      owner,
      quest,
      queryLists,
    ],
  )

  const refetch = useCallback(
    (names: Iterable<string>, cause: RefetchCause) =>
      track(runRefetch(names, cause)),
    [runRefetch, track],
  )

  const load = useCallback(
    () =>
      track(
        (async () => {
          const rows = await loadStoredOptions(owner).catch(
            (): StoredVariableOptions[] => [],
          )
          const names = new Set(queryLists().map((v) => v.name))
          const seeded = { ...listOptionsRef.current }
          for (const row of rows) {
            if (!names.has(row.name)) continue
            seeded[row.name] = seedState(seeded[row.name], row)
          }
          commit(seeded)
          return runRefetch(names, "load")
        })(),
      ),
    [commit, owner, queryLists, runRefetch, track],
  )

  const adoptPrefetched = useCallback(
    (prefetched: PrefetchedVariableOptions): VariableValuesEntry[] => {
      const next = { ...listOptionsRef.current }
      for (const [name, fetched] of Object.entries(prefetched)) {
        abortsRef.current.get(name)?.abort()
        next[name] = {
          ...(next[name] ?? EMPTY_STATE),
          status: "ready",
          ...fetched,
          error: undefined,
        }
      }
      commit(next)
      return Object.entries(prefetched).map(([name, fetched]) =>
        fetchedValuesEntry(name, fetched),
      )
    },
    [commit],
  )

  const savePrefetched = useCallback(
    (prefetched: PrefetchedVariableOptions) =>
      Promise.all(
        Object.entries(prefetched).map(([name, fetched]) =>
          saveStoredOptions({
            owner,
            name,
            options: fetched.options,
            fetchedAt: fetched.fetchedAt,
          }).catch(() => undefined),
        ),
      ),
    [owner],
  )

  const refetchChanged = useCallback(
    (
      changedNames: string[],
      redefinedNames: string[],
      cause: RefetchCause,
      prefetched: PrefetchedVariableOptions = {},
    ) =>
      track(
        (async () => {
          const adopted = adoptPrefetched(prefetched)
          const skip = new Set(Object.keys(prefetched).map(lower))
          const names = listsAffectedByChange(
            variables(),
            changedNames,
            redefinedNames,
          )
            .map((v) => v.name)
            .filter((name) => !skip.has(lower(name)))
          await deleteStoredOptions(owner, redefinedNames).catch(
            () => undefined,
          )
          await savePrefetched(prefetched)
          return [...adopted, ...(await runRefetch(names, cause))]
        })(),
      ),
    [adoptPrefetched, owner, runRefetch, savePrefetched, track, variables],
  )

  const refetchForTimeRange = useCallback(
    (cause: RefetchCause) =>
      refetch(
        listsAffectedByTimeRange(variables()).map((v) => v.name),
        cause,
      ),
    [refetch, variables],
  )

  const settle = useCallback(async (): Promise<VariableValuesEntry[]> => {
    const reports = await Promise.all([...inFlightRef.current])
    return reports.flat()
  }, [])

  const prune = useCallback(() => {
    const keep = new Set(queryLists().map((v) => v.name))
    const removed = Object.keys(listOptionsRef.current).filter(
      (name) => !keep.has(name),
    )
    if (removed.length === 0) return
    for (const name of removed) abortsRef.current.get(name)?.abort()
    commit(
      Object.fromEntries(
        Object.entries(listOptionsRef.current).filter(([name]) =>
          keep.has(name),
        ),
      ),
    )
    void deleteStoredOptions(owner, removed).catch(() => undefined)
  }, [commit, owner, queryLists])

  useEffect(() => {
    const aborts = abortsRef.current
    return () => {
      for (const controller of aborts.values()) controller.abort()
    }
  }, [])

  return {
    listOptions,
    listOptionsRef,
    refetch,
    load,
    refetchChanged,
    refetchForTimeRange,
    settle,
    prune,
  }
}
