import {
  useCallback,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react"
import { toast } from "../../../../components/Toast"
import type {
  NotebookCell,
  NotebookSettings,
  NotebookVariable,
  TimeRange,
} from "../../../../store/notebook"
import type { Client } from "../../../../utils/questdb/client"
import {
  commitView,
  type ViewParts,
} from "../../../../utils/notebooks/notebookDexieView"
import { prepareNotebookVariables } from "../../../../utils/notebooks/notebookVariableOptions"
import {
  assertNotebookGlobalsRevision,
  replaceNotebookGlobals,
  saveNotebookGlobals,
} from "../../../../store/notebookGlobals"
import { GLOBAL_OPTIONS_OWNER } from "../../../../store/notebookOptions"
import {
  getBufferActionSeq,
  signalUserEdit,
} from "../../../../utils/notebooks/notebookAIBridge"
import { trackEvent } from "../../../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../../../modules/ConsoleEventTracker/events"
import type { NotebookTransitionResult } from "../../../../utils/notebooks/notebookController/notebookTransitions"
import { commitVariables as commitPreparedVariables } from "./commitVariables"
import type { PreparedVariables, VariableStep } from "./prepareVariables"
import { changedVariableNames } from "./variableChanges"
import {
  assertNotebookVariablesUnchanged,
  type VariableApplyBaseline,
} from "./variableApplyConflict"
import type { GlobalVariablesActions } from "./globals/GlobalVariablesProvider"
import type { useVariableOptions } from "./useVariableOptions"

type Args = {
  bufferId: number
  quest: Client
  globals: GlobalVariablesActions
  settingsRef: MutableRefObject<NotebookSettings>
  cellsRef: MutableRefObject<NotebookCell[]>
  maximizedCellIdRef: MutableRefObject<string | null>
  focusedCellIdRef: MutableRefObject<string | null>
  setSettingsState: Dispatch<SetStateAction<NotebookSettings>>
  applyVariableChanges: ReturnType<typeof useVariableOptions>["apply"]
  applyTransition: <T>(
    transition: (parts: ViewParts) => NotebookTransitionResult<T>,
  ) => T
}

export const useNotebookVariableUpdates = ({
  bufferId,
  quest,
  globals,
  settingsRef,
  cellsRef,
  maximizedCellIdRef,
  focusedCellIdRef,
  setSettingsState,
  applyVariableChanges,
  applyTransition,
}: Args) => {
  const saveVariableSettings = useCallback(
    async (prepared: PreparedVariables, baseline?: VariableApplyBaseline) => {
      const outcome = await commitView(
        bufferId,
        {
          cells: cellsRef.current,
          settings: {
            ...settingsRef.current,
            variables: prepared.settings.variables,
            timeRange: prepared.settings.timeRange,
          },
          maximizedCellId: maximizedCellIdRef.current,
          focusedCellId: focusedCellIdRef.current,
        },
        baseline
          ? (view) =>
              assertNotebookVariablesUnchanged(view.settings ?? {}, baseline)
          : undefined,
      )
      if (outcome !== "committed")
        throw new Error("Notebook is no longer available.")
    },
    [bufferId, cellsRef],
  )

  const publishVariableSettings = useCallback(
    (prepared: PreparedVariables) => {
      settingsRef.current = {
        ...settingsRef.current,
        variables: prepared.settings.variables,
        timeRange: prepared.settings.timeRange,
      }
      setSettingsState(settingsRef.current)
      signalUserEdit(bufferId)
    },
    [bufferId],
  )

  const applyNotebookSettings = useCallback(
    async (
      updateSettings: (current: NotebookSettings) => NotebookSettings,
      signal: AbortSignal,
      onStep?: (step: VariableStep) => void,
      globalVariables?: NotebookVariable[],
      baseline?: VariableApplyBaseline,
    ) => {
      let preparedGlobal: PreparedVariables
      let nextGlobals: NotebookVariable[]
      let globalChanged: string[]
      await applyVariableChanges(() => updateSettings(settingsRef.current), {
        signal,
        onStep,
        prepare: async (settings, signal) => {
          const changed = changedVariableNames(
            settingsRef.current.variables ?? [],
            settings.variables ?? [],
          )
          nextGlobals = globalVariables ?? globals.getVariables()
          globalChanged = changedVariableNames(
            globals.getVariables(),
            nextGlobals,
          )
          const result = await prepareNotebookVariables(
            {
              quest,
              signal,
              force: new Set(
                [...changed, ...globalChanged].map((name) =>
                  name.toLowerCase(),
                ),
              ),
              onStep,
            },
            bufferId,
            settings,
            nextGlobals,
          )
          preparedGlobal = result.global
          return result.notebook
        },
        saveSettings: async (prepared) => {
          await commitPreparedVariables(
            GLOBAL_OPTIONS_OWNER,
            preparedGlobal,
            async () => {
              if (baseline && globalChanged.length > 0) {
                await replaceNotebookGlobals(
                  nextGlobals,
                  baseline.globalRevision,
                  signal,
                )
              } else if (baseline) {
                await assertNotebookGlobalsRevision(
                  baseline.globalRevision,
                  signal,
                )
              } else if (globalChanged.length > 0) {
                await saveNotebookGlobals(nextGlobals)
              }
            },
            signal,
          )
          await saveVariableSettings(prepared, baseline)
        },
        onCommit: (prepared) => {
          publishVariableSettings(prepared)
          globals.adoptVariables(nextGlobals, preparedGlobal, bufferId)
        },
      })
    },
    [
      applyVariableChanges,
      bufferId,
      globals,
      publishVariableSettings,
      quest,
      saveVariableSettings,
    ],
  )

  const applyVariableTransition = useCallback(
    async <T>(
      transition: (parts: ViewParts) => NotebookTransitionResult<T>,
      signal?: AbortSignal,
    ): Promise<T> => {
      const readParts = () => ({
        cells: cellsRef.current,
        settings: settingsRef.current,
        maximizedCellId: maximizedCellIdRef.current,
        focusedCellId: focusedCellIdRef.current,
      })
      const actionSeq = getBufferActionSeq(bufferId)
      const requireUnchanged = () => {
        if (getBufferActionSeq(bufferId) !== actionSeq)
          throw new Error(
            "The notebook changed during validation. Read its current state and retry.",
          )
      }
      const out = transition(readParts())
      if (!out.variables) return applyTransition(() => out)
      const diff = out.variables
      const controller = new AbortController()
      const operationSignal = signal ?? controller.signal
      let preparedGlobal: PreparedVariables
      await applyVariableChanges(out.parts.settings, {
        signal: operationSignal,
        prepare: async (_settings, signal) => {
          requireUnchanged()
          const result =
            out.preparedVariables ??
            (await prepareNotebookVariables(
              {
                quest,
                signal,
                force: new Set(
                  [
                    ...diff.changed,
                    ...diff.redefined,
                    ...(diff.timeRangeChanged
                      ? ["timeFrom", "timeTo", "timeFilter"]
                      : []),
                  ].map((name) => name.toLowerCase()),
                ),
              },
              bufferId,
              out.parts.settings,
              globals.getVariables(),
            ))
          preparedGlobal = result.global
          return result.notebook
        },
        saveSettings: async () => {
          requireUnchanged()
          await commitPreparedVariables(
            GLOBAL_OPTIONS_OWNER,
            preparedGlobal,
            async () => {
              const result = await commitView(bufferId, out.parts)
              if (result !== "committed")
                throw new Error("Notebook is no longer available.")
            },
            operationSignal,
          )
        },
        onCommit: () => {
          applyTransition(() => ({
            ...out,
            variables: undefined,
            persisted: true,
          }))
          globals.adoptVariables(
            globals.getVariables(),
            preparedGlobal,
            bufferId,
          )
        },
      })
      return out.result
    },
    [applyTransition, applyVariableChanges, bufferId, globals, quest, cellsRef],
  )

  const setTimeRange = useCallback(
    async (
      range: TimeRange | null,
      signal: AbortSignal = new AbortController().signal,
      onStep?: (step: VariableStep) => void,
    ) => {
      await applyNotebookSettings(
        (settings) => ({ ...settings, timeRange: range ?? undefined }),
        signal,
        onStep,
      )
      void trackEvent(
        range
          ? ConsoleEvent.NOTEBOOK_TIME_RANGE_APPLY
          : ConsoleEvent.NOTEBOOK_TIME_RANGE_CLEAR,
      )
    },
    [applyNotebookSettings],
  )

  const applyVariables = useCallback(
    async (
      variables: NotebookVariable[],
      globalVariables: NotebookVariable[],
      baseline: VariableApplyBaseline,
      signal: AbortSignal,
      onStep: (step: VariableStep) => void,
    ) => {
      await applyNotebookSettings(
        (settings) => ({ ...settings, variables }),
        signal,
        onStep,
        globalVariables,
        baseline,
      )
    },
    [applyNotebookSettings],
  )

  const updateVariable = useCallback(
    (
      name: string,
      update: (variable: NotebookVariable) => NotebookVariable,
    ) => {
      void applyVariableChanges(
        () => ({
          ...settingsRef.current,
          variables: (settingsRef.current.variables ?? []).map((variable) =>
            variable.name === name ? update(variable) : variable,
          ),
        }),
        {
          changed: [name],
          saveSettings: saveVariableSettings,
          onCommit: publishVariableSettings,
        },
      ).catch((error) =>
        toast.error(
          error instanceof Error ? error.message : "Could not update variable",
        ),
      )
    },
    [applyVariableChanges, publishVariableSettings, saveVariableSettings],
  )

  return {
    setTimeRange,
    applyVariables,
    updateVariable,
    applyVariableTransition,
  }
}
