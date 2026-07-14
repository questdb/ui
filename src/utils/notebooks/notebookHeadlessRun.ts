import { eventBus } from "../../modules/EventBus"
import { EventType } from "../../modules/EventBus/types"
import type {
  CellResult,
  NotebookCell,
  NotebookVariable,
  NotebookViewState,
} from "../../store/notebook"
import type { Client } from "../questdb/client"
import type { RunCellSummary } from "./notebookController"
import { NotebookToolError } from "./notebookToolError"
import { enqueueBufferTask } from "./notebookBufferQueue"
import { emitAgentEdit } from "./agentActivity"
import { executeSingleRaw } from "../executeSingleRaw"
import { getQueriesFromText } from "../../scenes/Editor/Monaco/utils"
import {
  attachScriptSummary,
  buildInitialScriptResults,
  capResultBytes,
  CELL_CHANGED_BEFORE_RUN_NOTE,
  CELL_CHANGED_MID_RUN_NOTE,
  CELL_DELETED_MID_RUN_NOTE,
  MOUNTED_MID_RUN_NOTE,
  NOTEBOOK_BYTE_CAP,
  NOTEBOOK_DELETED_MID_RUN_NOTE,
  NOTEBOOK_ROW_CAP,
  patchCellRunResult,
  RESULT_NOT_SAVED_RUN_NOTE,
  setResultAt,
  singleResultFromExec,
  STORAGE_FULL_RUN_NOTE,
  summarizeCellResults,
  SUPERSEDED_RUN_NOTE,
  USER_CHANGED_MID_RUN_NOTE,
} from "../../scenes/Editor/Notebook/notebookUtils"
import { persistCellSnapshot } from "../../scenes/Editor/Notebook/persistCellSnapshot"
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
        | "notebook_gone"
        | "cell_gone"
        | "cell_changed"
        | "user_changed"
        | "superseded"
        | "storage_full"
    }

// Mirrors the live path's beginCellRun (useCellExecution): a newer headless run
// of the same cell supersedes an older one, so a slow stale result can never
// overwrite the newer run's recording.
const headlessRunGenerations = new Map<number, Map<string, number>>()

const beginHeadlessRun = (
  bufferId: number,
  cellId: string,
): (() => boolean) => {
  const perBuffer =
    headlessRunGenerations.get(bufferId) ?? new Map<string, number>()
  const generation = (perBuffer.get(cellId) ?? 0) + 1
  perBuffer.set(cellId, generation)
  headlessRunGenerations.set(bufferId, perBuffer)
  return () => headlessRunGenerations.get(bufferId)?.get(cellId) === generation
}

export const forgetHeadlessRuns = (bufferId: number): void => {
  headlessRunGenerations.delete(bufferId)
}

const emptySummary = (): RunCellSummary => ({
  success: false,
  queryCount: 0,
  results: [],
})

const executeCellQueries = async (args: {
  cell: NotebookCell
  queries: string[]
  queryText: string
  variables: NotebookVariable[] | undefined
  quest: Client
  signal?: AbortSignal
}): Promise<CellResult> => {
  const { cell, queries, queryText, variables, quest, signal } = args
  const runAbort = new AbortController()
  let aborted = false
  const onAbort = () => {
    aborted = true
    runAbort.abort()
  }
  if (signal?.aborted) onAbort()
  else signal?.addEventListener("abort", onAbort, { once: true })

  const isScript = queries.length > 1
  const startTime = Date.now()
  let working: NotebookCell[] = [
    {
      ...cell,
      result: {
        results: isScript
          ? buildInitialScriptResults(queries)
          : [{ type: "running", query: queryText }],
        activeResultIndex: 0,
        timestamp: Date.now(),
      },
    },
  ]

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
          working = setResultAt(working, cell.id, j, {
            type: "cancelled",
            query: queries[j],
          })
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
      working = setResultAt(
        working,
        cell.id,
        i,
        capResultBytes(
          singleResultFromExec(exec, queries[i]),
          NOTEBOOK_BYTE_CAP,
        ),
      )
      if (exec.type === "error") {
        failedCount++
        for (let j = i + 1; j < queries.length; j++) {
          working = setResultAt(working, cell.id, j, {
            type: "cancelled",
            query: queries[j],
          })
        }
        break
      }
      successCount++
    }

    if (isScript) {
      working = attachScriptSummary(working, cell.id, {
        successCount,
        failedCount,
        durationMs: Date.now() - startTime,
      })
    }
    const result = working[0].result
    if (!result) {
      throw new Error("executeCellQueries lost the seeded cell result")
    }
    return result
  } finally {
    signal?.removeEventListener("abort", onAbort)
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

  const isCurrentRun = beginHeadlessRun(bufferId, cellId)

  // The queue is NOT held during execution, so runs on other cells of the
  // same notebook proceed in parallel; the commit re-reads and patches only
  // this cell.
  const ranResult = await executeCellQueries({
    cell: prep.cell,
    queries,
    queryText,
    variables: prep.variables,
    quest,
    signal,
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
      } catch {
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
      if (!isCurrentRun()) {
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
      if (commit !== "committed") {
        return { committed: false, reason: "notebook_gone" }
      }
      const snapshotSaved = await persistCellSnapshot({
        bufferId,
        cellId,
        results: ranResult.results,
        savedAt: Date.now(),
      })
      return { committed: true, snapshotSaved }
    },
  )

  const summary = summarizeCellResults({ ...prep.cell, result: ranResult })
  if (outcome.committed) {
    emitAgentEdit({ bufferId, cellId })
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
  }
}

export const __resetNotebookHeadlessRunsForTests = (): void => {
  headlessRunGenerations.clear()
  __resetBufferOwnershipForTests()
}
