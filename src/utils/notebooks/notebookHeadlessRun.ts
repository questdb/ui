import { eventBus } from "../../modules/EventBus"
import { EventType } from "../../modules/EventBus/types"
import type {
  CellResult,
  NotebookVariable,
  NotebookViewState,
  SingleQueryResult,
} from "../../store/notebook"
import type { Client } from "../questdb/client"
import type { RunCellSummary } from "./notebookController"
import { NotebookToolError } from "./notebookToolError"
import { enqueueBufferTask } from "./notebookBufferQueue"
import { emitAgentEdit } from "./agentActivity"
import { executeSingleRaw } from "../executeSingleRaw"
import { getQueriesFromText } from "../../scenes/Editor/Monaco/utils"
import {
  buildInitialScriptResults,
  CELL_CHANGED_BEFORE_RUN_NOTE,
  CELL_CHANGED_MID_RUN_NOTE,
  CELL_DELETED_MID_RUN_NOTE,
  MOUNTED_MID_RUN_NOTE,
  NOTEBOOK_ARCHIVED_MID_RUN_NOTE,
  NOTEBOOK_DELETED_MID_RUN_NOTE,
  NOTEBOOK_ROW_CAP,
  patchCellRunResult,
  RESULT_NOT_SAVED_RUN_NOTE,
  singleResultFromExec,
  STORAGE_FULL_RUN_NOTE,
  summarizeCellResults,
  SUPERSEDED_RUN_NOTE,
  USER_CHANGED_MID_RUN_NOTE,
} from "../../scenes/Editor/Notebook/notebookUtils"
import { persistCellSnapshot } from "../../scenes/Editor/Notebook/persistCellSnapshot"
import { pruneToRecentNotebooks } from "../../store/notebookResults"
import {
  commitView,
  partsOf,
  readNotebookView,
  requireCellIn,
  type CommitOutcome,
} from "./notebookDexieView"
import {
  getMountEpoch,
  __resetBufferOwnershipForTests,
} from "./notebookController/bufferOwnership"

// Headless cell execution for unmounted notebook buffers: run the SQL outside
// the buffer queue, then commit the result behind every invalidation check
// that could make it stale (mount, user edit, newer run, rewritten SQL).

export type DexieControllerDeps = {
  // True while the buffer's provider is mounting or mounted; a run result must
  // not be recorded underneath a live owner.
  isBufferClaimed: () => boolean
  // Fresh accessor (reconnect-safe); undefined until the agent runtime registers.
  getQuest: () => Client | undefined
  // The buffer's user-action seq. A run result is not recorded when it advanced
  // between prep and commit — the user visited and changed the notebook mid-run.
  getBufferSeq: () => number
}

type RunCommitOutcome =
  | { committed: true; snapshotSaved: boolean }
  | {
      committed: false
      reason:
        | "mounted"
        | "notebook_archived"
        | "notebook_gone"
        | "cell_gone"
        | "cell_changed"
        | "user_changed"
        | "superseded"
        | "storage_full"
    }

type ActiveHeadlessRun = {
  controller: AbortController
}

type HeadlessRunHandle = {
  signal: AbortSignal
  isCurrent: () => boolean
  finish: () => void
}

// Mirrors the live path's beginCellRun (useCellExecution): a newer headless run
// of the same cell aborts the older run as well as superseding its result
const activeHeadlessRuns = new Map<number, Map<string, ActiveHeadlessRun>>()

const beginHeadlessRun = (
  bufferId: number,
  cellId: string,
): HeadlessRunHandle => {
  const perBuffer =
    activeHeadlessRuns.get(bufferId) ?? new Map<string, ActiveHeadlessRun>()
  perBuffer.get(cellId)?.controller.abort()
  const activeRun: ActiveHeadlessRun = {
    controller: new AbortController(),
  }
  perBuffer.set(cellId, activeRun)
  activeHeadlessRuns.set(bufferId, perBuffer)
  return {
    signal: activeRun.controller.signal,
    isCurrent: () =>
      activeHeadlessRuns.get(bufferId)?.get(cellId) === activeRun,
    finish: () => {
      const currentPerBuffer = activeHeadlessRuns.get(bufferId)
      if (currentPerBuffer?.get(cellId) !== activeRun) return
      currentPerBuffer.delete(cellId)
      if (currentPerBuffer.size === 0) activeHeadlessRuns.delete(bufferId)
    },
  }
}

export const forgetHeadlessRuns = (bufferId: number): void => {
  const perBuffer = activeHeadlessRuns.get(bufferId)
  if (perBuffer) {
    for (const run of perBuffer.values()) run.controller.abort()
  }
  activeHeadlessRuns.delete(bufferId)
}

const emptySummary = (): RunCellSummary => ({
  success: false,
  queryCount: 0,
  results: [],
})

const executeCellQueries = async (args: {
  queries: string[]
  queryText: string
  variables: NotebookVariable[] | undefined
  quest: Client
  signal?: AbortSignal
  supersedeSignal: AbortSignal
}): Promise<CellResult> => {
  const { queries, queryText, variables, quest, signal, supersedeSignal } = args
  const runAbort = new AbortController()
  let aborted = false
  const onAbort = () => {
    aborted = true
    runAbort.abort()
  }
  const abortSignals = signal ? [signal, supersedeSignal] : [supersedeSignal]
  for (const abortSignal of abortSignals) {
    if (abortSignal.aborted) onAbort()
    else abortSignal.addEventListener("abort", onAbort, { once: true })
  }

  const isScript = queries.length > 1
  const startTime = Date.now()
  const results: SingleQueryResult[] = isScript
    ? buildInitialScriptResults(queries)
    : [{ type: "running", query: queryText }]

  try {
    let successCount = 0
    let failedCount = 0
    for (let i = 0; i < queries.length; i++) {
      // Aborted before this statement started: cancel it and the rest (live
      // parity: runScript's loop-top check). A statement that was already in
      // flight when the abort landed still records its REAL awaited outcome
      // below — it may have completed server-side, and reporting it as
      // cancelled would push the agent into re-running a committed write.
      if (aborted) {
        for (let j = i; j < queries.length; j++) {
          results[j] = {
            type: "cancelled",
            query: queries[j],
            reason: "user",
          }
        }
        break
      }
      const exec = await executeSingleRaw(
        quest,
        queries[i],
        variables,
        runAbort.signal,
        NOTEBOOK_ROW_CAP,
      )
      if (exec.type === "ddl" || exec.type === "dml") {
        eventBus.publish(EventType.MSG_QUERY_SCHEMA)
      }
      results[i] = singleResultFromExec(exec, queries[i])
      if (exec.type === "error") {
        failedCount++
        for (let j = i + 1; j < queries.length; j++) {
          results[j] = {
            type: "cancelled",
            query: queries[j],
            reason: "priorFailure",
          }
        }
        break
      }
      successCount++
    }

    const result: CellResult = {
      results,
      activeResultIndex: 0,
      timestamp: startTime,
    }
    if (isScript) {
      result.script = {
        successCount,
        failedCount,
        durationMs: Date.now() - startTime,
      }
    }
    return result
  } finally {
    for (const abortSignal of abortSignals) {
      abortSignal.removeEventListener("abort", onAbort)
    }
  }
}

export const runHeadlessCell = async (
  bufferId: number,
  deps: DexieControllerDeps,
  cellId: string,
  signal?: AbortSignal,
  sql?: string,
): Promise<RunCellSummary> => {
  const prep = await enqueueBufferTask(bufferId, async () => {
    const view = await readNotebookView(bufferId)
    return {
      cell: requireCellIn(view.cells, cellId, bufferId),
      variables: view.settings?.variables,
      seqAtPrep: deps.getBufferSeq(),
      mountEpochAtPrep: getMountEpoch(bufferId),
    }
  })
  if (prep.cell.type === "markdown") return emptySummary()
  if (sql !== undefined && sql !== prep.cell.value) {
    return {
      ...summarizeCellResults(undefined),
      unverified: true,
      note: CELL_CHANGED_BEFORE_RUN_NOTE,
    }
  }
  const queryText = sql ?? prep.cell.value
  if (!queryText.trim() || signal?.aborted) return emptySummary()
  const queries = getQueriesFromText(queryText)
  if (queries.length === 0) return emptySummary()

  const quest = deps.getQuest()
  if (!quest) {
    throw new NotebookToolError(
      "workspace_unavailable",
      "Notebook agent runtime is not ready yet.",
    )
  }

  const run = beginHeadlessRun(bufferId, cellId)

  try {
    // The queue is NOT held during execution, so runs on other cells of the
    // same notebook proceed in parallel; the commit re-reads and patches only
    // this cell.
    const ranResult = await executeCellQueries({
      queries,
      queryText,
      variables: prep.variables,
      quest,
      signal,
      supersedeSignal: run.signal,
    })

    const outcome = await enqueueBufferTask(
      bufferId,
      async (): Promise<RunCommitOutcome> => {
        if (deps.isBufferClaimed()) {
          return { committed: false, reason: "mounted" }
        }
        let view: NotebookViewState
        try {
          view = await readNotebookView(bufferId)
        } catch (error) {
          if (error instanceof NotebookToolError && error.code === "archived") {
            return { committed: false, reason: "notebook_archived" }
          }
          return { committed: false, reason: "notebook_gone" }
        }
        const currentCell = view.cells.find((c) => c.id === cellId)
        if (!currentCell) {
          return { committed: false, reason: "cell_gone" }
        }
        // The user opened (and possibly already closed) the notebook while this
        // run was executing — whatever the live session recorded wins.
        if (getMountEpoch(bufferId) !== prep.mountEpochAtPrep) {
          return { committed: false, reason: "mounted" }
        }
        if (!run.isCurrent()) {
          return { committed: false, reason: "superseded" }
        }
        // The user visited the notebook and edited or ran something while
        // this run was executing — their newer state wins over a stale result.
        if (deps.getBufferSeq() !== prep.seqAtPrep) {
          return { committed: false, reason: "user_changed" }
        }
        // A concurrent agent edit rewrote the cell's SQL — before prep (the
        // dispatch gate classified `sql` from an earlier read) or mid-run.
        // Recording would attribute this result to SQL that never produced it.
        if (currentCell.value !== queryText) {
          return { committed: false, reason: "cell_changed" }
        }
        const parts = partsOf(view)
        let commit: CommitOutcome
        try {
          commit = await commitView(bufferId, {
            ...parts,
            cells: patchCellRunResult(parts.cells, cellId, ranResult),
          })
        } catch {
          return { committed: false, reason: "storage_full" }
        }
        if (commit === "archived") {
          return { committed: false, reason: "notebook_archived" }
        }
        if (commit === "deleted") {
          return { committed: false, reason: "notebook_gone" }
        }
        const snapshotSaved = await persistCellSnapshot({
          bufferId,
          cellId,
          results: ranResult.results,
          savedAt: Date.now(),
          activeResultIndex: ranResult.activeResultIndex,
          ...(ranResult.script ? { script: ranResult.script } : {}),
        })
        // Headless saves land on unmounted buffers
        void pruneToRecentNotebooks()
        return { committed: true, snapshotSaved }
      },
    )

    const summary = summarizeCellResults({ ...prep.cell, result: ranResult })
    if (outcome.committed) {
      if (!signal?.aborted) emitAgentEdit({ bufferId, cellId })
      return outcome.snapshotSaved
        ? summary
        : { ...summary, note: RESULT_NOT_SAVED_RUN_NOTE }
    }
    switch (outcome.reason) {
      case "mounted":
        return { ...summary, unverified: true, note: MOUNTED_MID_RUN_NOTE }
      case "user_changed":
        return { ...summary, unverified: true, note: USER_CHANGED_MID_RUN_NOTE }
      case "superseded":
        return { ...summary, unverified: true, note: SUPERSEDED_RUN_NOTE }
      case "cell_changed":
        return { ...summary, unverified: true, note: CELL_CHANGED_MID_RUN_NOTE }
      case "storage_full":
        return { ...summary, unverified: true, note: STORAGE_FULL_RUN_NOTE }
      case "cell_gone":
        return { ...summary, unverified: true, note: CELL_DELETED_MID_RUN_NOTE }
      case "notebook_gone":
        return {
          ...summary,
          unverified: true,
          note: NOTEBOOK_DELETED_MID_RUN_NOTE,
        }
      case "notebook_archived":
        return {
          ...summary,
          unverified: true,
          note: NOTEBOOK_ARCHIVED_MID_RUN_NOTE,
        }
    }
  } finally {
    run.finish()
  }
}

export const __resetNotebookHeadlessRunsForTests = (): void => {
  for (const bufferId of activeHeadlessRuns.keys()) {
    forgetHeadlessRuns(bufferId)
  }
  __resetBufferOwnershipForTests()
}
