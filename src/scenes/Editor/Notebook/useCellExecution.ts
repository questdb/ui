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
import {
  buildInitialScriptResults,
  type CellRunOutcome,
  hasPendingResult,
  NOTEBOOK_ROW_CAP,
  resolveRunCompletion,
  singleResultFromExec,
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
  updateCellResult,
  updateCell,
  updateCells,
  setScriptSummary,
  onSnapshotPersisted,
}: Options) => {
  const [runningCellIds, setRunningCellIds] = useState<Set<string>>(new Set())

  const abortControllersRef = useRef<Map<string, AbortController[]>>(new Map())

  const runGenerationRef = useRef<Map<string, number>>(new Map())

  const autoFocusRef = useRef<Map<string, boolean>>(new Map())

  // Persist a faithful, already-capped copy of the cell's result so it survives
  // tab-switch / reload. One record per cell, restored by cell id alone.
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
        ...(result.script ? { script: result.script } : {}),
      }).then((saved) => {
        if (saved) onSnapshotPersisted(cellId, result.results)
      })
    },
    [bufferId, cellsRef, onSnapshotPersisted],
  )

  const runScript = useCallback(
    async (
      cellId: string,
      queries: string[],
      externalSignal: AbortSignal | undefined,
      expectFullValue: boolean,
    ): Promise<CellRunOutcome> => {
      if (queries.length === 0) return { ok: false, superseded: false }

      const prior = abortControllersRef.current.get(cellId)
      prior?.forEach((c) => c.abort())

      const isCurrentRun = beginCellRun(runGenerationRef, cellId)
      const startCell = cellsRef.current.find((c) => c.id === cellId)
      const priorResult = hasPendingResult(startCell?.result)
        ? undefined
        : startCell?.result
      const valueAtRunStart = startCell?.value

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

          const result = await executeSingle(
            sql,
            perQuery.signal,
            NOTEBOOK_ROW_CAP,
          )
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
      persistSnapshot,
    ],
  )

  const runCell = useCallback(
    async (
      cellId: string,
      sql?: string,
      externalSignal?: AbortSignal,
      expectFullValue: boolean = false,
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
      if (queries.length > 1) {
        return runScript(cellId, queries, externalSignal, expectFullValue)
      }

      const prior = abortControllersRef.current.get(cellId)
      prior?.forEach((c) => c.abort())

      const isCurrentRun = beginCellRun(runGenerationRef, cellId)
      const valueAtRunStart = cell.value
      const priorRaw = cellsRef.current.find((c) => c.id === cellId)?.result
      const priorResult = hasPendingResult(priorRaw) ? undefined : priorRaw

      const ac = new AbortController()
      const onExternalAbort = () => ac.abort(externalSignal?.reason)
      externalSignal?.addEventListener("abort", onExternalAbort, {
        once: true,
      })
      abortControllersRef.current.set(cellId, [ac])

      const runningResult: CellResult = {
        results: [{ type: "running", query: queryText }],
        activeResultIndex: 0,
        timestamp: Date.now(),
      }
      updateCell(cellId, { result: runningResult })

      setRunningCellIds((prev) => new Set(prev).add(cellId))
      try {
        const execResult = await executeSingle(
          queryText,
          ac.signal,
          NOTEBOOK_ROW_CAP,
        )
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
          results: [singleResultFromExec(execResult, queryText)],
          activeResultIndex: 0,
          timestamp: Date.now(),
        }
        updateCell(cellId, { result: cellResult })
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
    [cellsRef, executeSingle, updateCell, runScript, persistSnapshot],
  )

  const reRunResultAt = useCallback(
    async (cellId: string, index: number): Promise<boolean> => {
      const cell = cellsRef.current.find((c) => c.id === cellId)
      if (!cell?.result) return false
      const target = cell.result.results[index]
      if (!target || !target.query.trim()) return false
      const sql = target.query

      const controllers = abortControllersRef.current.get(cellId) ?? []
      controllers[index]?.abort()
      const ac = new AbortController()
      controllers[index] = ac
      abortControllersRef.current.set(cellId, controllers)

      updateCellResult(cellId, index, { type: "running", query: sql })

      const execResult = await executeSingle(sql, ac.signal, NOTEBOOK_ROW_CAP)
      if (ac.signal.aborted) return execResult.type !== "error"
      publishSchemaIfMutating(execResult)
      const liveCell = cellsRef.current.find((c) => c.id === cellId)
      if (!liveCell?.result) return execResult.type !== "error"
      updateCellResult(cellId, index, singleResultFromExec(execResult, sql))
      persistSnapshot(cellId)
      return execResult.type !== "error"
    },
    [cellsRef, executeSingle, updateCellResult, persistSnapshot],
  )

  // Silently discard an in-flight run: no cancelled markers, no snapshot
  // delete. For ownership hand-offs (run→draw) where the chart engine takes
  // over and the run must simply stop writing.
  const abortCellRun = useCallback((cellId: string) => {
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

  const setActiveResultIndex = useCallback(
    (cellId: string, index: number) => {
      autoFocusRef.current.set(cellId, false)
      updateCells((prev) =>
        prev.map((c) => {
          if (c.id !== cellId || !c.result) return c
          return { ...c, result: { ...c.result, activeResultIndex: index } }
        }),
      )
      // Keep the snapshot on the tab the user is viewing, so a release or a
      // reload restores this tab instead of snapping back to the first.
      void updateCellSnapshotActiveIndex(bufferId, cellId, index).catch(
        () => undefined,
      )
    },
    [updateCells, bufferId],
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
    setActiveResultIndex,
  }
}
