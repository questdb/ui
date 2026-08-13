import { useCallback, useEffect, useRef, useState } from "react"
import type { Dispatch, MutableRefObject, SetStateAction } from "react"
import type {
  CellResult,
  NotebookCell,
  SingleQueryResult,
} from "../../../store/notebook"
import type { QueryExecResult } from "../../../hooks/useQueryExecution"
import { eventBus } from "../../../modules/EventBus"
import { EventType } from "../../../modules/EventBus/types"
import { getQueriesFromText } from "../Monaco/utils"
import type { ValidateQueryResult } from "../../../utils/questdb/types"
import {
  hasWriteStatement,
  resolveRunBarrier,
  type ClassifiedStatement,
  type RunBarrierOutcome,
  type RunCellGate,
} from "../../../utils/tools/permissions"
import { statementRequestLimiter } from "../../../utils/questdb/requestLimiter"
import {
  buildInitialScriptResults,
  type CellRunOutcome,
  hasPendingResult,
  NOTEBOOK_ROW_CAP,
  resolveRunCompletion,
  runHistoryPatch,
  singleResultFromExec,
  statementKeysFor,
} from "./notebookUtils"
import { persistCellSnapshot } from "./persistCellSnapshot"
import { updateCellSnapshotActiveIndex } from "../../../store/notebookResults"

const publishSchemaIfMutating = (exec: QueryExecResult): void => {
  if (exec.type === "ddl" || exec.type === "dml") {
    eventBus.publish(EventType.MSG_QUERY_SCHEMA)
  }
}

const beginCellRun = (
  runGenerationRef: MutableRefObject<Map<string, number>>,
  cellId: string,
) => {
  const generation = (runGenerationRef.current.get(cellId) ?? 0) + 1
  runGenerationRef.current.set(cellId, generation)

  return () => runGenerationRef.current.get(cellId) === generation
}

const supersedeCellRun = (
  runGenerationRef: MutableRefObject<Map<string, number>>,
  cellId: string,
) => {
  runGenerationRef.current.set(
    cellId,
    (runGenerationRef.current.get(cellId) ?? 0) + 1,
  )
}

const clearRunningCell = (
  abortControllersRef: MutableRefObject<Map<string, AbortController[]>>,
  autoFocusRef: MutableRefObject<Map<string, boolean>>,
  setRunningCellIds: Dispatch<SetStateAction<Set<string>>>,
  cellId: string,
) => {
  abortControllersRef.current.delete(cellId)
  autoFocusRef.current.delete(cellId)
  setRunningCellIds((prev) => {
    const next = new Set(prev)
    next.delete(cellId)
    return next
  })
}

type Options = {
  bufferId: number
  cellsRef: MutableRefObject<NotebookCell[]>
  executeSingle: (
    sql: string,
    signal?: AbortSignal,
    limit?: number,
  ) => Promise<QueryExecResult>
  validateWithGlobals: (
    sql: string,
    signal?: AbortSignal,
  ) => Promise<ValidateQueryResult>
  updateCellResult: (
    cellId: string,
    index: number,
    result: SingleQueryResult,
    activeIndex?: number,
  ) => void
  updateCell: (cellId: string, updates: Partial<NotebookCell>) => void
  updateCells: (updater: (prev: NotebookCell[]) => NotebookCell[]) => void
  setScriptSummary: (
    cellId: string,
    summary: { successCount: number; failedCount: number; durationMs: number },
  ) => void
  onSnapshotPersisted: (cellId: string, results: SingleQueryResult[]) => void
}

export const useCellExecution = ({
  bufferId,
  cellsRef,
  executeSingle,
  validateWithGlobals,
  updateCellResult,
  updateCell,
  updateCells,
  setScriptSummary,
  onSnapshotPersisted,
}: Options) => {
  const [runningCellIds, setRunningCellIds] = useState<Set<string>>(new Set())

  const abortControllersRef = useRef<Map<string, AbortController[]>>(new Map())

  // Barrier-phase claims: a run that is still validating has no per-query
  // controllers yet, so cancel and delete reach it through this map.
  const barrierAbortsRef = useRef<Map<string, Set<AbortController>>>(new Map())

  const runGenerationRef = useRef<Map<string, number>>(new Map())

  const autoFocusRef = useRef<Map<string, boolean>>(new Map())

  // Persist a byte-capped copy of the cell's result so it survives tab-switch /
  // reload. One record per cell, restored by cell id alone.
  const persistSnapshot = useCallback(
    (cellId: string, explicitResult?: CellResult) => {
      const cell = cellsRef.current.find((c) => c.id === cellId)
      if (!cell) return
      const result = explicitResult ?? cell.result
      if (!result) return
      void persistCellSnapshot({
        bufferId,
        cellId,
        results: result.results,
        savedAt: Date.now(),
        activeResultIndex: result.activeResultIndex,
        ...(result.activeStatementKey !== undefined
          ? { activeStatementKey: result.activeStatementKey }
          : {}),
        ...(result.script ? { script: result.script } : {}),
      }).then((saved) => {
        if (saved) onSnapshotPersisted(cellId, result.results)
      })
    },
    [bufferId, cellsRef, onSnapshotPersisted],
  )

  // Recorded run history: only checked run commits write it, always right
  // after the commit's generation-and-SQL checks passed, from the frame the
  // run just landed.
  const stampRunHistory = useCallback(
    (cellId: string) => {
      const cell = cellsRef.current.find((c) => c.id === cellId)
      if (!cell?.result) return
      updateCell(cellId, runHistoryPatch(cell.result))
    },
    [cellsRef, updateCell],
  )

  const runScript = useCallback(
    async (
      cellId: string,
      queries: string[],
      externalSignal: AbortSignal | undefined,
      expectFullValue: boolean,
      valueAtRunStart: string,
    ): Promise<CellRunOutcome> => {
      if (queries.length === 0) return { ok: false, superseded: false }

      const prior = abortControllersRef.current.get(cellId)
      prior?.forEach((c) => c.abort())

      const isCurrentRun = beginCellRun(runGenerationRef, cellId)
      const startCell = cellsRef.current.find((c) => c.id === cellId)
      const priorResult = hasPendingResult(startCell?.result)
        ? undefined
        : startCell?.result

      // One AbortController per query so `cancelQuery(index)` cancels just that slot.
      const controllers = queries.map(() => new AbortController())
      const onExternalAbort = () =>
        controllers.forEach((c) => c.abort(externalSignal?.reason))
      if (externalSignal?.aborted) {
        onExternalAbort()
      } else {
        externalSignal?.addEventListener("abort", onExternalAbort, {
          once: true,
        })
      }
      abortControllersRef.current.set(cellId, controllers)
      autoFocusRef.current.set(cellId, true)

      const startTime = Date.now()

      const initialCellResult: CellResult = {
        results: buildInitialScriptResults(queries),
        activeResultIndex: 0,
        timestamp: Date.now(),
      }
      updateCell(cellId, { result: initialCellResult })

      const finalResults = buildInitialScriptResults(queries)

      setRunningCellIds((prev) => new Set(prev).add(cellId))

      let successCount = 0
      let failedCount = 0

      try {
        for (let i = 0; i < queries.length; i++) {
          const perQuery = controllers[i]
          if (perQuery.signal.aborted) {
            failedCount++
            const interrupted: SingleQueryResult = {
              type: "error",
              query: queries[i],
              error: "Cancelled by user",
            }
            finalResults[i] = interrupted
            updateCellResult(cellId, i, interrupted)
            for (let j = i + 1; j < queries.length; j++) {
              const skipped: SingleQueryResult = {
                type: "cancelled",
                query: queries[j],
                reason: "priorFailure",
              }
              finalResults[j] = skipped
              updateCellResult(cellId, j, skipped)
            }
            break
          }

          const sql = queries[i]
          const isAuto = autoFocusRef.current.get(cellId)
          updateCellResult(
            cellId,
            i,
            { type: "running", query: sql },
            isAuto ? i : undefined,
          )

          let result: QueryExecResult
          try {
            result = await statementRequestLimiter(
              () => executeSingle(sql, perQuery.signal, NOTEBOOK_ROW_CAP),
              perQuery.signal,
            )
          } catch {
            result = {
              type: "error",
              query: sql,
              columns: [],
              dataset: [],
              count: 0,
              error: "Cancelled by user",
            }
          }
          if (!isCurrentRun()) {
            return { ok: failedCount === 0, superseded: true }
          }
          const landed = singleResultFromExec(result, sql)
          finalResults[i] = landed
          updateCellResult(cellId, i, landed)
          publishSchemaIfMutating(result)

          if (result.type === "error") {
            failedCount++
            for (let j = i + 1; j < queries.length; j++) {
              const cancelled: SingleQueryResult = {
                type: "cancelled",
                query: queries[j],
                reason: "priorFailure",
              }
              finalResults[j] = cancelled
              updateCellResult(cellId, j, cancelled)
            }
            break
          }
          successCount++
        }

        const liveCell = cellsRef.current.find((c) => c.id === cellId)
        if (!liveCell) {
          return {
            ok: failedCount === 0,
            superseded: false,
            resultCleared: true,
          }
        }
        const completion = resolveRunCompletion(
          liveCell,
          valueAtRunStart,
          expectFullValue,
        )
        if (completion === "result_cleared") {
          return {
            ok: failedCount === 0,
            superseded: false,
            resultCleared: true,
          }
        }
        if (completion === "cell_changed") {
          updateCell(cellId, { result: priorResult })
          return {
            ok: failedCount === 0,
            superseded: false,
            cellChanged: true,
          }
        }
        if (!liveCell.result) {
          updateCell(cellId, {
            result: {
              results: finalResults,
              activeResultIndex: 0,
              timestamp: Date.now(),
            },
          })
        }
        setScriptSummary(cellId, {
          successCount,
          failedCount,
          durationMs: Date.now() - startTime,
        })
        stampRunHistory(cellId)
        persistSnapshot(cellId)
      } finally {
        externalSignal?.removeEventListener("abort", onExternalAbort)
        if (isCurrentRun()) {
          clearRunningCell(
            abortControllersRef,
            autoFocusRef,
            setRunningCellIds,
            cellId,
          )
        }
      }

      return {
        ok: failedCount === 0,
        superseded: false,
        result: {
          results: finalResults,
          activeResultIndex: 0,
          timestamp: Date.now(),
        },
      }
    },
    [
      cellsRef,
      executeSingle,
      updateCell,
      updateCellResult,
      setScriptSummary,
      stampRunHistory,
      persistSnapshot,
    ],
  )

  // Parallel run for refreshable (non-write) cells: every DQL statement
  // launches at once through the shared limiter; an invalid statement is
  // skipped with its validation error as the slot result; one failure skips
  // nothing. No tab auto-advance — completion order is random.
  const runParallel = useCallback(
    async (
      cellId: string,
      queries: string[],
      classified: ClassifiedStatement[],
      externalSignal: AbortSignal | undefined,
      expectFullValue: boolean,
      valueAtRunStart: string,
    ): Promise<CellRunOutcome> => {
      const prior = abortControllersRef.current.get(cellId)
      prior?.forEach((c) => c.abort())

      const isCurrentRun = beginCellRun(runGenerationRef, cellId)
      const startCell = cellsRef.current.find((c) => c.id === cellId)
      const priorResult = hasPendingResult(startCell?.result)
        ? undefined
        : startCell?.result

      const controllers = queries.map(() => new AbortController())
      const onExternalAbort = () =>
        controllers.forEach((c) => c.abort(externalSignal?.reason))
      if (externalSignal?.aborted) {
        onExternalAbort()
      } else {
        externalSignal?.addEventListener("abort", onExternalAbort, {
          once: true,
        })
      }
      abortControllersRef.current.set(cellId, controllers)
      autoFocusRef.current.set(cellId, false)

      const startTime = Date.now()
      updateCell(cellId, {
        result: {
          results: buildInitialScriptResults(queries),
          activeResultIndex: 0,
          timestamp: Date.now(),
        },
      })
      const finalResults = buildInitialScriptResults(queries)
      setRunningCellIds((prev) => new Set(prev).add(cellId))

      let failedCount = 0
      try {
        await Promise.all(
          queries.map(async (sql, index) => {
            const stmt = classified[index]
            if (stmt?.klass === "ERROR") {
              failedCount++
              const invalid: SingleQueryResult = {
                type: "error",
                query: sql,
                error: stmt.error ?? "Invalid statement",
              }
              finalResults[index] = invalid
              if (isCurrentRun()) updateCellResult(cellId, index, invalid)
              return
            }
            const perQuery = controllers[index]
            if (perQuery.signal.aborted) {
              failedCount++
              const interrupted: SingleQueryResult = {
                type: "error",
                query: sql,
                error: "Cancelled by user",
              }
              finalResults[index] = interrupted
              if (isCurrentRun()) updateCellResult(cellId, index, interrupted)
              return
            }
            updateCellResult(cellId, index, { type: "running", query: sql })
            let result: QueryExecResult
            try {
              result = await statementRequestLimiter(
                () => executeSingle(sql, perQuery.signal, NOTEBOOK_ROW_CAP),
                perQuery.signal,
              )
            } catch {
              result = {
                type: "error",
                query: sql,
                columns: [],
                dataset: [],
                count: 0,
                error: "Cancelled by user",
              }
            }
            if (!isCurrentRun()) return
            const landed = singleResultFromExec(result, sql)
            finalResults[index] = landed
            updateCellResult(cellId, index, landed)
            if (result.type === "error") failedCount++
          }),
        )

        if (!isCurrentRun()) {
          return { ok: failedCount === 0, superseded: true }
        }
        const liveCell = cellsRef.current.find((c) => c.id === cellId)
        if (!liveCell) {
          return {
            ok: failedCount === 0,
            superseded: false,
            resultCleared: true,
          }
        }
        const completion = resolveRunCompletion(
          liveCell,
          valueAtRunStart,
          expectFullValue,
        )
        if (completion === "result_cleared") {
          return {
            ok: failedCount === 0,
            superseded: false,
            resultCleared: true,
          }
        }
        if (completion === "cell_changed") {
          updateCell(cellId, { result: priorResult })
          return {
            ok: failedCount === 0,
            superseded: false,
            cellChanged: true,
          }
        }
        if (!liveCell.result) {
          updateCell(cellId, {
            result: {
              results: finalResults,
              activeResultIndex: 0,
              timestamp: Date.now(),
            },
          })
        }
        if (queries.length > 1) {
          setScriptSummary(cellId, {
            successCount: queries.length - failedCount,
            failedCount,
            durationMs: Date.now() - startTime,
          })
        }
        stampRunHistory(cellId)
        persistSnapshot(cellId)
      } finally {
        externalSignal?.removeEventListener("abort", onExternalAbort)
        if (isCurrentRun()) {
          clearRunningCell(
            abortControllersRef,
            autoFocusRef,
            setRunningCellIds,
            cellId,
          )
        }
      }

      return {
        ok: failedCount === 0,
        superseded: false,
        result: {
          results: finalResults,
          activeResultIndex: 0,
          timestamp: Date.now(),
        },
      }
    },
    [
      cellsRef,
      executeSingle,
      updateCell,
      updateCellResult,
      setScriptSummary,
      stampRunHistory,
      persistSnapshot,
    ],
  )

  const runCell = useCallback(
    async (
      cellId: string,
      sql?: string,
      externalSignal?: AbortSignal,
      expectFullValue: boolean = false,
      gate?: RunCellGate,
    ): Promise<CellRunOutcome> => {
      const notRun: CellRunOutcome = { ok: false, superseded: false }
      const cell = cellsRef.current.find((c) => c.id === cellId)
      if (!cell) return notRun
      // Markdown cells hold prose, not SQL — never execute them.
      if (cell.type === "markdown") return notRun

      const queryText = sql ?? cell.value
      if (!queryText.trim()) return notRun
      if (externalSignal?.aborted) return notRun

      if (expectFullValue && queryText !== cell.value) {
        return {
          ok: false,
          superseded: false,
          cellChanged: true,
          notStarted: true,
        }
      }

      const queries = getQueriesFromText(queryText)
      if (queries.length === 0) return notRun

      // The run claims the cell before the barrier: the attribution baseline
      // is the gesture-time value, and a barrier-phase abort handle lets
      // cancel and delete reach a run that is still validating.
      const valueAtRunStart = cell.value
      const barrierAc = new AbortController()
      const onBarrierAbort = () => barrierAc.abort(externalSignal?.reason)
      externalSignal?.addEventListener("abort", onBarrierAbort, { once: true })
      const claims =
        barrierAbortsRef.current.get(cellId) ?? new Set<AbortController>()
      claims.add(barrierAc)
      barrierAbortsRef.current.set(cellId, claims)

      let barrier: RunBarrierOutcome
      try {
        barrier = await resolveRunBarrier(
          queryText,
          queries.length,
          gate,
          (stmt) =>
            statementRequestLimiter(
              () => validateWithGlobals(stmt, barrierAc.signal),
              barrierAc.signal,
            ),
        )
      } finally {
        externalSignal?.removeEventListener("abort", onBarrierAbort)
        claims.delete(barrierAc)
        if (claims.size === 0) barrierAbortsRef.current.delete(cellId)
      }

      // Re-check the claim after the barrier await: a cancel, delete, or
      // mode change that landed during validation would otherwise launch —
      // and commit — the run.
      if (barrierAc.signal.aborted || externalSignal?.aborted) return notRun
      if (barrier.action === "denied") {
        return { ok: false, superseded: false, denied: barrier.reason }
      }
      if (barrier.action === "skipped") {
        return { ok: false, superseded: false, skipped: barrier.reason }
      }
      const classified = barrier.classified
      const liveAfterBarrier = cellsRef.current.find((c) => c.id === cellId)
      if (!liveAfterBarrier || liveAfterBarrier.type === "markdown") {
        return notRun
      }

      if (classified && !hasWriteStatement(classified)) {
        return runParallel(
          cellId,
          queries,
          classified,
          externalSignal,
          expectFullValue,
          valueAtRunStart,
        )
      }
      if (queries.length > 1) {
        return runScript(
          cellId,
          queries,
          externalSignal,
          expectFullValue,
          valueAtRunStart,
        )
      }

      const prior = abortControllersRef.current.get(cellId)
      prior?.forEach((c) => c.abort())

      const isCurrentRun = beginCellRun(runGenerationRef, cellId)
      const priorRaw = cellsRef.current.find((c) => c.id === cellId)?.result
      const priorResult = hasPendingResult(priorRaw) ? undefined : priorRaw

      const ac = new AbortController()
      const onExternalAbort = () => ac.abort(externalSignal?.reason)
      externalSignal?.addEventListener("abort", onExternalAbort, {
        once: true,
      })
      abortControllersRef.current.set(cellId, [ac])

      // Record the parsed statement, never the raw cell text: display and
      // carryover attach results by statement content, and comments around the
      // statement would orphan the frame. Execution still sends queryText.
      const recordedQuery = queries[0]
      const runningResult: CellResult = {
        results: [{ type: "running", query: recordedQuery }],
        activeResultIndex: 0,
        timestamp: Date.now(),
      }
      updateCell(cellId, { result: runningResult })

      setRunningCellIds((prev) => new Set(prev).add(cellId))
      try {
        let execResult: QueryExecResult
        try {
          execResult = await statementRequestLimiter(
            () => executeSingle(queryText, ac.signal, NOTEBOOK_ROW_CAP),
            ac.signal,
          )
        } catch {
          execResult = {
            type: "error",
            query: queryText,
            columns: [],
            dataset: [],
            count: 0,
            error: "Cancelled by user",
          }
        }
        // A newer run (or a cancel) superseded this one; don't write its result.
        if (!isCurrentRun()) {
          return { ok: execResult.type !== "error", superseded: true }
        }
        publishSchemaIfMutating(execResult)
        const liveCell = cellsRef.current.find((c) => c.id === cellId)
        if (!liveCell) {
          return {
            ok: execResult.type !== "error",
            superseded: false,
            resultCleared: true,
          }
        }
        const completion = resolveRunCompletion(
          liveCell,
          valueAtRunStart,
          expectFullValue,
        )
        if (completion === "result_cleared") {
          return {
            ok: execResult.type !== "error",
            superseded: false,
            resultCleared: true,
          }
        }
        if (completion === "cell_changed") {
          updateCell(cellId, { result: priorResult })
          return {
            ok: execResult.type !== "error",
            superseded: false,
            cellChanged: true,
          }
        }
        const cellResult: CellResult = {
          results: [singleResultFromExec(execResult, recordedQuery)],
          activeResultIndex: 0,
          timestamp: Date.now(),
        }
        updateCell(cellId, {
          result: cellResult,
          ...runHistoryPatch(cellResult),
        })
        persistSnapshot(cellId, cellResult)
        return {
          ok: execResult.type !== "error",
          superseded: false,
          result: cellResult,
        }
      } finally {
        externalSignal?.removeEventListener("abort", onExternalAbort)
        if (isCurrentRun()) {
          clearRunningCell(
            abortControllersRef,
            autoFocusRef,
            setRunningCellIds,
            cellId,
          )
        }
      }
    },
    [
      cellsRef,
      executeSingle,
      validateWithGlobals,
      updateCell,
      runScript,
      runParallel,
      persistSnapshot,
    ],
  )

  // The per-tab rerun keeps its presentation (the slot blanks to a running
  // placeholder) but joins the run/refresh arbiter: it enters the run
  // generation, marks the cell running so refresh ticks skip, and its commit
  // is generation-checked. `committed` and `ok` separate: a committed error
  // result is still newer than any stale refresh error the slot carries.
  const reRunResultAt = useCallback(
    async (
      cellId: string,
      index: number,
    ): Promise<{ committed: boolean; ok: boolean }> => {
      const notCommitted = { committed: false, ok: false }
      const cell = cellsRef.current.find((c) => c.id === cellId)
      if (!cell?.result) return notCommitted
      const target = cell.result.results[index]
      if (!target || !target.query.trim()) return notCommitted
      const sql = target.query

      const isCurrentRun = beginCellRun(runGenerationRef, cellId)
      const controllers = abortControllersRef.current.get(cellId) ?? []
      controllers[index]?.abort()
      const ac = new AbortController()
      controllers[index] = ac
      abortControllersRef.current.set(cellId, controllers)
      setRunningCellIds((prev) => new Set(prev).add(cellId))

      updateCellResult(cellId, index, { type: "running", query: sql })

      try {
        let execResult: QueryExecResult
        try {
          execResult = await statementRequestLimiter(
            () => executeSingle(sql, ac.signal, NOTEBOOK_ROW_CAP),
            ac.signal,
          )
        } catch {
          execResult = {
            type: "error",
            query: sql,
            columns: [],
            dataset: [],
            count: 0,
            error: "Cancelled by user",
          }
        }
        if (ac.signal.aborted || !isCurrentRun()) return notCommitted
        publishSchemaIfMutating(execResult)
        const liveCell = cellsRef.current.find((c) => c.id === cellId)
        if (!liveCell?.result) return notCommitted
        updateCellResult(cellId, index, singleResultFromExec(execResult, sql))
        stampRunHistory(cellId)
        persistSnapshot(cellId)
        return { committed: true, ok: execResult.type !== "error" }
      } finally {
        if (isCurrentRun()) {
          setRunningCellIds((prev) => {
            const next = new Set(prev)
            next.delete(cellId)
            return next
          })
        }
      }
    },
    [
      cellsRef,
      executeSingle,
      updateCellResult,
      stampRunHistory,
      persistSnapshot,
    ],
  )

  // Silently discard an in-flight run: no cancelled markers, no snapshot
  // delete. For ownership hand-offs (run→draw) where the chart engine takes
  // over and the run must simply stop writing.
  const abortCellRun = useCallback((cellId: string) => {
    barrierAbortsRef.current.get(cellId)?.forEach((ac) => ac.abort())
    const controllers = abortControllersRef.current.get(cellId)
    if (!controllers) return
    // Supersede the in-flight run so its late resolution can't write back
    supersedeCellRun(runGenerationRef, cellId)
    controllers.forEach((ac) => ac.abort())
    clearRunningCell(
      abortControllersRef,
      autoFocusRef,
      setRunningCellIds,
      cellId,
    )
  }, [])

  const cancelCell = useCallback((cellId: string) => {
    barrierAbortsRef.current.get(cellId)?.forEach((ac) => ac.abort())
    const controllers = abortControllersRef.current.get(cellId)
    if (!controllers) return
    controllers.forEach((ac) => ac.abort())
  }, [])

  const cancelQuery = useCallback(
    (cellId: string, index: number) => {
      const controllers = abortControllersRef.current.get(cellId)
      if (!controllers || !controllers[index]) return
      controllers[index].abort()
      const target = cellsRef.current.find((c) => c.id === cellId)?.result
        ?.results[index]
      if (target?.type === "running") {
        updateCellResult(cellId, index, {
          type: "error",
          query: target.query,
          error: "Cancelled by user",
        })
      }
    },
    [cellsRef, updateCellResult],
  )

  // The active tab is a STATEMENT, not a position: a tab the user selects may
  // hold no result yet (added since the last run), and the compact array's
  // indices shift as statements come and go.
  const setActiveStatement = useCallback(
    (cellId: string, statementKey: string) => {
      autoFocusRef.current.set(cellId, false)
      const result = cellsRef.current.find((c) => c.id === cellId)?.result
      if (!result) return
      const resultIndex = statementKeysFor(
        result.results.map((r) => r.query),
      ).indexOf(statementKey)
      const activeResultIndex =
        resultIndex === -1 ? result.activeResultIndex : resultIndex
      updateCells((prev) =>
        prev.map((c) => {
          if (c.id !== cellId || !c.result) return c
          return {
            ...c,
            result: {
              ...c.result,
              activeResultIndex,
              activeStatementKey: statementKey,
            },
          }
        }),
      )
      // Keep the snapshot on the tab the user is viewing, so a release or a
      // reload restores this tab instead of snapping back to the first.
      void updateCellSnapshotActiveIndex(
        bufferId,
        cellId,
        activeResultIndex,
        statementKey,
      ).catch(() => undefined)
    },
    [cellsRef, updateCells, bufferId],
  )

  useEffect(() => {
    const controllersMap = abortControllersRef.current
    return () => {
      // Supersede before aborting so the in-flight continuations bail at their
      // isCurrentRun() checks instead of overwriting the cell's last good
      // snapshot with an abort-error (or a frozen "running" state) on unmount.
      controllersMap.forEach((list, cellId) => {
        supersedeCellRun(runGenerationRef, cellId)
        list.forEach((c) => c.abort())
      })
      controllersMap.clear()
    }
  }, [])

  return {
    runningCellIds,
    runCell,
    reRunResultAt,
    abortCellRun,
    cancelCell,
    cancelQuery,
    setActiveStatement,
  }
}
