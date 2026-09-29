import { useCallback, useEffect, useRef, useState } from "react"
import { unstable_batchedUpdates } from "react-dom"
import { toast } from "../../../../components/Toast"
import type { DeclareEntry, NotebookSettings } from "../../../../store/notebook"
import { loadStoredOptions } from "../../../../store/notebookOptions"
import { enqueueBufferTask } from "../../../../utils/notebooks/notebookBufferQueue"
import type { Client } from "../../../../utils/questdb/client"
import type { ListOptionsState } from "./declareEntries"
import {
  isQueryList,
  fetchedValuesEntry,
  type VariableValuesEntry,
} from "./options/fetchVariableOptions"
import { listsAffectedByTimeRange } from "./options/affectedLists"
import { changedVariableNames, redefinedVariableNames } from "./variableChanges"
import { TIME_VARIABLE_NAMES, sameTimeRange } from "./timeRange"
import { commitVariables } from "./commitVariables"
import {
  prepareVariables,
  requireNotAborted,
  type PreparedVariables,
  type VariableErrors,
  type VariableStep,
} from "./prepareVariables"

export const showVariableUpdateError = (error: unknown): void => {
  if (error instanceof Error && error.name === "AbortError") return
  toast.error(
    error instanceof Error ? error.message : "Could not update variables",
  )
}

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
export type VariableUpdate = {
  signal?: AbortSignal
  prepare?: (
    settings: NotebookSettings,
    signal: AbortSignal,
  ) => Promise<PreparedVariables>
  onStep?: (step: VariableStep) => void
  changed?: string[]
  refresh?: string[]
  loadStored?: boolean
  validateEntries?: boolean
  saveSettings?: (prepared: PreparedVariables) => Promise<void>
  onCommit?: (prepared: PreparedVariables) => void
}

type Args = {
  quest: Client
  owner: string
  getSettings: () => NotebookSettings
  getPrefixEntries: () => DeclareEntry[]
  getPrefixErrors?: () => VariableErrors
  waitForPrefix?: () => Promise<unknown>
  onRefetched?: (names: string[]) => void
}

const listStates = (prepared: PreparedVariables): VariableOptionsByName =>
  Object.fromEntries(
    (prepared.settings.variables ?? []).filter(isQueryList).map(({ name }) => [
      name,
      {
        ...(prepared.options[name] ?? {
          options: [],
          columns: [],
          truncated: false,
          warnings: [],
        }),
        status: prepared.errors[name] ? "error" : "ready",
        error: prepared.errors[name],
      },
    ]),
  )

export const useVariableOptions = ({
  quest,
  owner,
  getSettings,
  getPrefixEntries,
  getPrefixErrors,
  waitForPrefix,
  onRefetched,
}: Args) => {
  const [state, setState] = useState<{
    listOptions: VariableOptionsByName
    errors: VariableErrors
  }>({ listOptions: {}, errors: {} })
  const [pending, setPending] = useState(0)
  const listOptionsRef = useRef<VariableOptionsByName>({})
  const snapshotRef = useRef<PreparedVariables>({
    settings: getSettings(),
    options: {},
    errors: {},
    entries: [],
    report: [],
  })
  const operationsRef = useRef(new Set<Promise<PreparedVariables>>())
  const controllersRef = useRef(new Set<AbortController>())
  const loadingRef = useRef<Promise<PreparedVariables> | null>(null)
  const tailRef = useRef<Promise<unknown>>(Promise.resolve())

  const adopt = useCallback((prepared: PreparedVariables) => {
    snapshotRef.current = prepared
    const listOptions = listStates(prepared)
    listOptionsRef.current = listOptions
    setState({ listOptions, errors: prepared.errors })
  }, [])

  const apply = useCallback(
    (
      proposal: NotebookSettings | (() => NotebookSettings),
      update: VariableUpdate = {},
    ): Promise<PreparedVariables> => {
      const controller = new AbortController()
      const abort = () => controller.abort()
      update.signal?.addEventListener("abort", abort, { once: true })
      if (update.signal?.aborted) abort()
      controllersRef.current.add(controller)
      setPending((count) => count + 1)
      const run = async () => {
        requireNotAborted(controller.signal)
        await waitForPrefix?.()
        requireNotAborted(controller.signal)
        const settings = typeof proposal === "function" ? proposal() : proposal
        const before = snapshotRef.current
        let options = before.options
        if (update.loadStored) {
          const rows = await loadStoredOptions(owner)
          requireNotAborted(controller.signal)
          options = Object.fromEntries(
            rows.map((row) => [
              row.name,
              { ...row, columns: [], truncated: false, warnings: [] },
            ]),
          )
          adopt({ ...before, settings, options })
        }
        const variables = settings.variables ?? []
        const rangeChanged = !sameTimeRange(
          before.settings.timeRange,
          settings.timeRange,
        )
        const changed =
          update.changed ??
          changedVariableNames(before.settings.variables ?? [], variables)
        const refresh =
          update.refresh ??
          redefinedVariableNames(before.settings.variables ?? [], variables)
        const prepared = update.prepare
          ? await update.prepare(settings, controller.signal)
          : await prepareVariables({
              quest,
              settings,
              prefixEntries: getPrefixEntries(),
              prefixErrors: getPrefixErrors?.(),
              options,
              errors: before.errors,
              changed: [
                ...changed,
                ...(rangeChanged ? TIME_VARIABLE_NAMES : []),
              ],
              refresh: [
                ...refresh,
                ...(rangeChanged
                  ? listsAffectedByTimeRange(variables).map((v) => v.name)
                  : []),
              ],
              signal: controller.signal,
              validateEntries: update.validateEntries,
              onStep: update.onStep,
            })
        requireNotAborted(controller.signal)
        update.onStep?.({ kind: "committing", name: "" })
        const saveSettings = update.saveSettings
        await commitVariables(
          owner,
          prepared,
          () => (saveSettings ? saveSettings(prepared) : Promise.resolve()),
          controller.signal,
        )
        unstable_batchedUpdates(() => {
          update.onCommit?.(prepared)
          adopt(prepared)
        })
        onRefetched?.([
          ...new Set([
            ...changed,
            ...prepared.report.map((entry) => entry.name),
          ]),
        ])
        return prepared
      }
      const bufferId = owner.startsWith("buffer:")
        ? Number(owner.slice(7))
        : null
      const work =
        bufferId === null
          ? tailRef.current.catch(() => undefined).then(run)
          : enqueueBufferTask(bufferId, run)
      tailRef.current = work
      operationsRef.current.add(work)
      void work
        .then(
          () => undefined,
          () => undefined,
        )
        .finally(() => {
          operationsRef.current.delete(work)
          controllersRef.current.delete(controller)
          update.signal?.removeEventListener("abort", abort)
          setPending((count) => count - 1)
        })
      return work
    },
    [
      adopt,
      getPrefixEntries,
      getPrefixErrors,
      onRefetched,
      owner,
      quest,
      waitForPrefix,
    ],
  )

  const load = useCallback(() => {
    const work = apply(getSettings, {
      loadStored: true,
      refresh: (getSettings().variables ?? []).map((v) => v.name),
      validateEntries: false,
    })
    loadingRef.current = work
    void work.catch(() => undefined)
    return work
  }, [apply, getSettings])

  const refetchChanged = useCallback(
    async (changed: string[], redefined: string[]) =>
      (await apply(getSettings, { changed, refresh: redefined })).report,
    [apply, getSettings],
  )
  const refetchWithDependents = useCallback(
    async (name: string) =>
      (await apply(getSettings, { changed: [name], refresh: [name] })).report,
    [apply, getSettings],
  )
  const refetchForTimeRange = useCallback(
    async () =>
      (
        await apply(getSettings, {
          changed: [...TIME_VARIABLE_NAMES],
          refresh: listsAffectedByTimeRange(getSettings().variables ?? []).map(
            (v) => v.name,
          ),
        })
      ).report,
    [apply, getSettings],
  )
  const settle = useCallback(async (): Promise<VariableValuesEntry[]> => {
    await loadingRef.current?.catch(() => undefined)
    while (operationsRef.current.size > 0)
      await Promise.allSettled([...operationsRef.current])
    const { options, errors } = snapshotRef.current
    return [
      ...Object.entries(options).map(([name, fetched]) =>
        fetchedValuesEntry(name, fetched),
      ),
      ...Object.entries(errors).map(([name, error]) => ({ name, error })),
    ]
  }, [])
  const getErrors = useCallback(() => snapshotRef.current.errors, [])

  useEffect(() => {
    const controllers = controllersRef.current
    return () => {
      for (const controller of controllers) controller.abort()
    }
  }, [])

  return {
    ...state,
    listOptions:
      pending > 0
        ? Object.fromEntries(
            Object.entries(state.listOptions).map(([name, options]) => [
              name,
              { ...options, status: "loading" as const },
            ]),
          )
        : state.listOptions,
    pending: pending > 0,
    listOptionsRef,
    apply,
    adopt,
    getErrors,
    load,
    refetchChanged,
    refetchWithDependents,
    refetchForTimeRange,
    settle,
  }
}
