import { eventBus } from "../../modules/EventBus"
import { EventType } from "../../modules/EventBus/types"
import { authSessionState } from "../../modules/OAuth2/authSessionState"
import { isSessionEnded, SessionEndedError } from "../../modules/OAuth2/session"
import { db } from "../../store/db"
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
import { executeSingleRaw, type QueryExecResult } from "../executeSingleRaw"
import { getQueriesFromText } from "../../scenes/Editor/Monaco/utils"
import { createValidateWithGlobals } from "../../scenes/Editor/Notebook/declareUtils"
import {
  hasWriteStatement,
  resolveRunBarrier,
  type ClassifiedStatement,
  type RunCellGate,
} from "../tools/permissions"
import { statementRequestLimiter } from "../questdb/requestLimiter"
import {
  buildInitialScriptResults,
  CELL_CHANGED_BEFORE_RUN_NOTE,
  CELL_CHANGED_MID_RUN_NOTE,
  errorResult,
  isUnverifiableExecError,
  MOUNTED_MID_RUN_NOTE,
  NOTEBOOK_ROW_CAP,
  RESULT_NOT_SAVED_RUN_NOTE,
  singleResultFromExec,
  STORAGE_FULL_RUN_NOTE,
  summarizeCellResults,
  USER_CHANGED_MID_RUN_NOTE,
} from "../../scenes/Editor/Notebook/notebookUtils"
import { patchCellRunResult } from "../../scenes/Editor/Notebook/cellSizing"
import {
  cancelledBeforeLaunchSummary,
  midRunCancellationNote,
  runCancellationOf,
  type RunCancellation,
  type RunCancelReason,
  cancelledResult,
  CELL_DELETED_MID_RUN_NOTE,
  NOTEBOOK_ARCHIVED_MID_RUN_NOTE,
  NOTEBOOK_DELETED_MID_RUN_NOTE,
} from "../../scenes/Editor/Notebook/runCancellation"
import {
  prepareCellSnapshot,
  persistPreparedCellSnapshot,
  reportSnapshotSaveFailure,
} from "../../scenes/Editor/Notebook/persistCellSnapshot"
import {
  deleteCellSnapshot,
  loadCellSnapshotSavedAt,
  pruneToRecentNotebooks,
} from "../../store/notebookResults"
import {
  commitView,
  partsOf,
  readNotebookView,
  requireCellIn,
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
        | "storage_full"
        | RunCancellation
    }

type CommitFailureReason = Extract<
  RunCommitOutcome,
  { committed: false }
>["reason"]

const commitRunAtomically = (
  bufferId: number,
  resultParts: ReturnType<typeof partsOf>,
  snapshot: ReturnType<typeof prepareCellSnapshot>,
  isCurrentSession: () => boolean,
): Promise<RunCommitOutcome> =>
  db.transaction("rw", db.buffers, db.notebook_results, async () => {
    const commit = await commitView(bufferId, resultParts, isCurrentSession)
    if (commit === "archived")
      return { committed: false, reason: "notebook_archived" }
    if (commit === "deleted")
      return { committed: false, reason: "notebook_gone" }
    // Throwing rolls back metadata as well as the snapshot. A completion
    // listener may end the session after acceptance without undoing the pair.
    if (commit === "discarded" || !isCurrentSession())
      throw new SessionEndedError()
    const snapshotSaved = await persistPreparedCellSnapshot(snapshot)
    if (!isCurrentSession()) throw new SessionEndedError()
    return { committed: true, snapshotSaved }
  })

const retryMetadataOnly = async (
  bufferId: number,
  resultParts: ReturnType<typeof partsOf>,
  invalidationReason: () => CommitFailureReason | undefined,
): Promise<RunCommitOutcome> => {
  const reason = invalidationReason()
  if (reason) return { committed: false, reason }
  try {
    const commit = await commitView(
      bufferId,
      resultParts,
      () => !invalidationReason(),
    )
    switch (commit) {
      case "committed":
        return { committed: true, snapshotSaved: false }
      case "archived":
        return { committed: false, reason: "notebook_archived" }
      case "deleted":
        return { committed: false, reason: "notebook_gone" }
      case "discarded":
        return {
          committed: false,
          reason: invalidationReason() ?? "user_changed",
        }
    }
  } catch {
    return { committed: false, reason: invalidationReason() ?? "storage_full" }
  }
}

type HeadlessClaim = {
  controller: AbortController
  generation: number
}

type HeadlessCellClaims = {
  claims: Set<HeadlessClaim>
  nextGeneration: number
  latestLaunchedGeneration: number
}

type HeadlessRunClaim = {
  signal: AbortSignal
  launch: () => boolean
  isCurrent: () => boolean
  release: () => void
}

// One claim covers a headless run's whole phase, validation through commit.
// Cancellation reaches it through the signal, whose reason names the cause
// (a transition, an archive, a supersession). Generations are assigned when
// validation begins, but a claim becomes authoritative only when it launches:
// a newer invocation that is denied or skipped must not cancel an in-flight
// statement. Launching stops honouring the external signal so a statement
// already in flight records its real outcome.
const headlessClaims = new Map<number, Map<string, HeadlessCellClaims>>()

const claimHeadlessRun = (
  bufferId: number,
  cellId: string,
  externalSignal?: AbortSignal,
): HeadlessRunClaim => {
  const perBuffer =
    headlessClaims.get(bufferId) ?? new Map<string, HeadlessCellClaims>()
  const state = perBuffer.get(cellId) ?? {
    claims: new Set<HeadlessClaim>(),
    nextGeneration: 0,
    latestLaunchedGeneration: 0,
  }
  const generation = state.nextGeneration + 1
  const claim: HeadlessClaim = {
    controller: new AbortController(),
    generation,
  }
  state.nextGeneration = generation
  state.claims.add(claim)
  perBuffer.set(cellId, state)
  headlessClaims.set(bufferId, perBuffer)

  const abortFromExternal = () => claim.controller.abort(externalSignal?.reason)
  if (externalSignal?.aborted) abortFromExternal()
  else
    externalSignal?.addEventListener("abort", abortFromExternal, { once: true })
  const stopExternal = () =>
    externalSignal?.removeEventListener("abort", abortFromExternal)

  return {
    signal: claim.controller.signal,
    launch: () => {
      stopExternal()
      if (
        claim.controller.signal.aborted ||
        claim.generation < state.latestLaunchedGeneration
      ) {
        if (!claim.controller.signal.aborted) {
          claim.controller.abort("superseded" satisfies RunCancelReason)
        }
        return false
      }

      state.latestLaunchedGeneration = claim.generation
      for (const older of state.claims) {
        if (older.generation < claim.generation) {
          older.controller.abort("superseded" satisfies RunCancelReason)
        }
      }
      return true
    },
    isCurrent: () =>
      !claim.controller.signal.aborted &&
      claim.generation === state.latestLaunchedGeneration,
    release: () => {
      stopExternal()
      state.claims.delete(claim)
      if (state.claims.size === 0 && perBuffer.get(cellId) === state) {
        perBuffer.delete(cellId)
      }
      if (perBuffer.size === 0 && headlessClaims.get(bufferId) === perBuffer) {
        headlessClaims.delete(bufferId)
      }
    },
  }
}

export const cancelHeadlessBufferRuns = (
  bufferId: number,
  reason: Extract<RunCancelReason, "notebook_archived" | "notebook_deleted">,
): void => {
  const perBuffer = headlessClaims.get(bufferId)
  if (!perBuffer) return
  for (const state of perBuffer.values()) {
    for (const claim of state.claims) claim.controller.abort(reason)
  }
  headlessClaims.delete(bufferId)
}

export const cancelHeadlessCellRuns = (
  bufferId: number,
  cellIds: readonly string[],
  reason: RunCancelReason,
): void => {
  const perBuffer = headlessClaims.get(bufferId)
  if (!perBuffer) return
  for (const cellId of cellIds) {
    const state = perBuffer.get(cellId)
    if (!state) continue
    for (const claim of state.claims) claim.controller.abort(reason)
  }
}

const emptySummary = (): RunCellSummary => ({
  success: false,
  queryCount: 0,
  results: [],
})

const sessionEndedBeforeLaunchSummary = (): RunCellSummary =>
  cancelledBeforeLaunchSummary("session_ended")

const nothingExecuted = (result: CellResult) =>
  result.results.every(
    (statement) =>
      statement.type === "cancelled" ||
      (statement.type === "error" && statement.requestNotSent),
  )

export const SESSION_INTERRUPTED_RUN_NOTE =
  "Session ended during run; statements may have executed. Verify their outcomes before re-running."

const sessionEndedSummary = (
  result: CellResult,
  saved: "run" | "marker" | "none" = "none",
): RunCellSummary => {
  if (nothingExecuted(result)) return sessionEndedBeforeLaunchSummary()
  return {
    success: false,
    queryCount: result.results.length,
    // Keep confirmed execution history without returning old-session SQL,
    // datasets, notices, or server error details to a still-settling caller.
    results: result.results.map((statement) => {
      if (statement.type === "cancelled") return "cancelled"
      if (statement.type === "running" || statement.type === "queued")
        return "pending"
      if (statement.type === "error") {
        if (statement.requestNotSent) return "ERROR: query not sent"
        return isUnverifiableExecError(statement)
          ? "ERROR: execution outcome unverified"
          : "ERROR: query failed"
      }
      return "success"
    }),
    cancelled: "session_ended",
    unverified: true,
    note:
      saved === "run"
        ? "Run history was recorded before the authentication session ended. Result details are withheld; verify before retrying writes."
        : saved === "marker"
          ? "The authentication session ended. An interruption marker was saved; result details were not retained. Statements already sent may have executed; verify before retrying writes."
          : midRunCancellationNote("session_ended"),
  }
}

const executeCellQueries = async (args: {
  queries: string[]
  queryText: string
  isCurrentSession: () => boolean
  variables: NotebookVariable[] | undefined
  quest: Client
  signal?: AbortSignal
  supersedeSignal: AbortSignal
}): Promise<CellResult> => {
  const {
    queries,
    queryText,
    isCurrentSession,
    variables,
    quest,
    signal,
    supersedeSignal,
  } = args
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
      if (aborted || !isCurrentSession()) {
        for (let j = i; j < queries.length; j++) {
          results[j] = cancelledResult(queries[j], "user")
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
          results[j] = cancelledResult(queries[j], "priorFailure")
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

// Parallel execution for refreshable (non-write) cells — live-path parity:
// every DQL statement launches at once through the shared limiter, an invalid
// statement is skipped with its validation error as the slot result, and one
// failure skips nothing.
const executeCellQueriesParallel = async (args: {
  queries: string[]
  classified: ClassifiedStatement[]
  isCurrentSession: () => boolean
  variables: NotebookVariable[] | undefined
  quest: Client
  signal?: AbortSignal
  supersedeSignal: AbortSignal
}): Promise<CellResult> => {
  const {
    queries,
    classified,
    isCurrentSession,
    variables,
    quest,
    signal,
    supersedeSignal,
  } = args
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

  const startTime = Date.now()
  const results: SingleQueryResult[] = buildInitialScriptResults(queries)
  let successCount = 0
  let failedCount = 0

  try {
    await Promise.all(
      queries.map(async (query, index) => {
        const stmt = classified[index]
        if (stmt?.klass === "ERROR") {
          failedCount++
          results[index] = {
            ...errorResult(query, stmt.error ?? "Invalid statement"),
            requestNotSent: true,
          }
          return
        }
        if (aborted || !isCurrentSession()) {
          results[index] = cancelledResult(query, "user")
          return
        }
        let exec: QueryExecResult
        try {
          exec = await statementRequestLimiter(() => {
            if (!isCurrentSession()) {
              runAbort.abort()
              throw new DOMException("Session ended", "AbortError")
            }
            return executeSingleRaw(
              quest,
              query,
              variables,
              runAbort.signal,
              NOTEBOOK_ROW_CAP,
            )
          }, runAbort.signal)
        } catch {
          results[index] = cancelledResult(query, "user")
          return
        }
        results[index] = singleResultFromExec(exec, query)
        if (exec.type === "error") failedCount++
        else successCount++
      }),
    )

    const result: CellResult = {
      results,
      activeResultIndex: 0,
      timestamp: startTime,
    }
    if (queries.length > 1) {
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
  gate?: RunCellGate,
): Promise<RunCellSummary> => {
  const { isCurrent: isCurrentSession } = authSessionState.capture()
  const prep = await enqueueBufferTask(bufferId, async () => {
    const view = await readNotebookView(bufferId)
    return {
      cell: requireCellIn(view.cells, cellId, bufferId),
      snapshotSavedAt: await loadCellSnapshotSavedAt(bufferId, cellId),
      variables: view.settings?.variables,
      seqAtPrep: deps.getBufferSeq(),
      mountEpochAtPrep: getMountEpoch(bufferId),
    }
  })
  if (!isCurrentSession()) return sessionEndedBeforeLaunchSummary()
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

  // The runner's barrier classification is the single decision for permission
  // enforcement, auto-run eligibility, and strategy — dispatch never
  // classifies separately (live-path parity). The claim opens the run's
  // phase here, so a concurrent transition can stop it before it launches.
  const claim = claimHeadlessRun(bufferId, cellId, signal)
  try {
    const validate = createValidateWithGlobals(quest, () => prep.variables)
    const barrier = await resolveRunBarrier(
      queryText,
      queries.length,
      gate,
      (stmt) =>
        statementRequestLimiter(
          () => validate(stmt, claim.signal),
          claim.signal,
        ),
    )
    if (!isCurrentSession()) return sessionEndedBeforeLaunchSummary()
    if (claim.signal.aborted) {
      return cancelledBeforeLaunchSummary(runCancellationOf(claim.signal))
    }
    if (barrier.action === "denied") {
      return { ...emptySummary(), denied: barrier.reason }
    }
    if (barrier.action === "skipped") {
      return { ...emptySummary(), skipped: barrier.reason }
    }
    const classified = barrier.classified

    if (!claim.launch()) {
      return cancelledBeforeLaunchSummary(runCancellationOf(claim.signal))
    }
    // The queue is NOT held during execution, so runs on other cells of the
    // same notebook proceed in parallel; the commit re-reads and patches only
    // this cell.
    const ranResult =
      classified && !hasWriteStatement(classified)
        ? await executeCellQueriesParallel({
            queries,
            classified,
            isCurrentSession,
            variables: prep.variables,
            quest,
            signal,
            supersedeSignal: claim.signal,
          })
        : await executeCellQueries({
            queries,
            queryText,
            isCurrentSession,
            variables: prep.variables,
            quest,
            signal,
            supersedeSignal: claim.signal,
          })

    // Keep an outcome marker, never old-session data, when a sent statement
    // outlives logout. The fresh transaction still honors every ownership/edit
    // guard, including a new run or snapshot saved by another browser tab.
    const finishEndedSession = async (
      committed = false,
    ): Promise<RunCellSummary> => {
      if (committed) return sessionEndedSummary(ranResult, "run")
      if (nothingExecuted(ranResult)) return sessionEndedBeforeLaunchSummary()
      const canMark = () =>
        !deps.isBufferClaimed() &&
        getMountEpoch(bufferId) === prep.mountEpochAtPrep &&
        claim.isCurrent() &&
        deps.getBufferSeq() === prep.seqAtPrep
      let marked = false
      try {
        marked = await enqueueBufferTask(bufferId, () =>
          db.transaction("rw", db.buffers, db.notebook_results, async () => {
            if (!canMark()) return false
            let view: NotebookViewState
            try {
              view = await readNotebookView(bufferId)
            } catch {
              return false
            }
            const cell = view.cells.find((item) => item.id === cellId)
            const snapshotSavedAt = await loadCellSnapshotSavedAt(
              bufferId,
              cellId,
            )
            if (
              !canMark() ||
              !cell ||
              JSON.stringify(cell) !== JSON.stringify(prep.cell) ||
              snapshotSavedAt !== prep.snapshotSavedAt
            )
              return false
            const parts = partsOf(view)
            const saved = await commitView(
              bufferId,
              {
                ...parts,
                cells: parts.cells.map((item) =>
                  item.id === cellId
                    ? {
                        ...item,
                        result: undefined,
                        lastRunStatus: "error",
                        lastRunError: SESSION_INTERRUPTED_RUN_NOTE,
                      }
                    : item,
                ),
              },
              canMark,
            )
            if (saved !== "committed") return false
            await deleteCellSnapshot(bufferId, cellId)
            return true
          }),
        )
      } catch (error) {
        reportSnapshotSaveFailure(error)
      }
      return sessionEndedSummary(ranResult, marked ? "marker" : "none")
    }

    if (!isCurrentSession()) return await finishEndedSession()

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
        if (!isCurrentSession()) {
          return { committed: false, reason: "session_ended" }
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
        if (!claim.isCurrent()) {
          return { committed: false, reason: runCancellationOf(claim.signal) }
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
        // Preparation serializes the full dataset before capping it. Reject
        // stale results first, and keep this work outside the transaction.
        const snapshot = prepareCellSnapshot({
          bufferId,
          cellId,
          results: ranResult.results,
          savedAt: Date.now(),
          activeResultIndex: ranResult.activeResultIndex,
          ...(ranResult.script ? { script: ranResult.script } : {}),
        })
        const parts = partsOf(view)
        const resultParts = {
          ...parts,
          cells: patchCellRunResult(parts.cells, cellId, ranResult),
        }
        try {
          return await commitRunAtomically(
            bufferId,
            resultParts,
            snapshot,
            isCurrentSession,
          )
        } catch (error) {
          if (isSessionEnded(error) || !isCurrentSession()) {
            return { committed: false, reason: "session_ended" }
          }
          reportSnapshotSaveFailure(error)
          // Check the same causes, in the same order, as before the commit.
          // Root commit failure can arrive after mount or cancellation changes.
          return retryMetadataOnly(bufferId, resultParts, () => {
            if (deps.isBufferClaimed()) return "mounted"
            if (!isCurrentSession()) return "session_ended"
            if (getMountEpoch(bufferId) !== prep.mountEpochAtPrep)
              return "mounted"
            if (!claim.isCurrent()) return runCancellationOf(claim.signal)
            if (deps.getBufferSeq() !== prep.seqAtPrep) return "user_changed"
            return undefined
          })
        }
      },
    )

    // Even a successful transaction can notify logout from its completion
    // event. Redact every outcome, including archived/gone and committed runs.
    if (!isCurrentSession()) return await finishEndedSession(outcome.committed)
    const summary = summarizeCellResults({ ...prep.cell, result: ranResult })
    if (outcome.committed) {
      // Only prune after the encompassing transaction has committed.
      void pruneToRecentNotebooks()
      if (isCurrentSession() && !signal?.aborted)
        emitAgentEdit({ bufferId, cellId })
      return outcome.snapshotSaved
        ? summary
        : { ...summary, note: RESULT_NOT_SAVED_RUN_NOTE }
    }
    switch (outcome.reason) {
      case "session_ended":
        return await finishEndedSession()
      case "mounted":
        return { ...summary, unverified: true, note: MOUNTED_MID_RUN_NOTE }
      case "user_changed":
        return { ...summary, unverified: true, note: USER_CHANGED_MID_RUN_NOTE }
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
      default:
        return {
          ...summary,
          unverified: true,
          cancelled: outcome.reason,
          note: midRunCancellationNote(outcome.reason),
        }
    }
  } finally {
    claim.release()
  }
}

export const __resetNotebookHeadlessRunsForTests = (): void => {
  for (const bufferId of [...headlessClaims.keys()]) {
    cancelHeadlessBufferRuns(bufferId, "notebook_deleted")
  }
  __resetBufferOwnershipForTests()
}
