import { useCallback, useEffect, useRef, useState } from "react"
import type { MutableRefObject } from "react"
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
  singleResultFromExec,
} from "./notebookUtils"

// Schema panel + completions listen for MSG_QUERY_SCHEMA to refresh.
const publishSchemaIfMutating = (type: QueryExecResult["type"]): void => {
  if (type === "ddl" || type === "dml") {
    eventBus.publish(EventType.MSG_QUERY_SCHEMA)
  }
}

type Options = {
  cellsRef: MutableRefObject<NotebookCell[]>
  executeSingle: (sql: string, signal?: AbortSignal) => Promise<QueryExecResult>
  updateCellResult: (
    cellId: string,
    index: number,
    result: SingleQueryResult,
    activeIndex?: number,
  ) => void
  updateCell: (cellId: string, updates: Partial<NotebookCell>) => void
  updateCells: (updater: (prev: NotebookCell[]) => NotebookCell[]) => void
  markCancelledAll: (cellId: string) => void
  markCancelledOne: (cellId: string, index: number) => void
  setScriptSummary: (
    cellId: string,
    summary: { successCount: number; failedCount: number; durationMs: number },
  ) => void
}

export const useCellExecution = ({
  cellsRef,
  executeSingle,
  updateCellResult,
  updateCell,
  updateCells,
  markCancelledAll,
  markCancelledOne,
  setScriptSummary,
}: Options) => {
  const [runningCellIds, setRunningCellIds] = useState<Set<string>>(new Set())

  const abortControllersRef = useRef<Map<string, AbortController[]>>(new Map())

  const autoFocusRef = useRef<Map<string, boolean>>(new Map())

  const runScript = useCallback(
    async (
      cellId: string,
      queries: string[],
      externalSignal?: AbortSignal,
    ): Promise<boolean> => {
      if (queries.length === 0) return false

      const prior = abortControllersRef.current.get(cellId)
      prior?.forEach((c) => c.abort())

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

      setRunningCellIds((prev) => new Set(prev).add(cellId))

      let successCount = 0
      let failedCount = 0

      try {
        for (let i = 0; i < queries.length; i++) {
          const perQuery = controllers[i]
          if (perQuery.signal.aborted) {
            for (let j = i; j < queries.length; j++) {
              updateCellResult(cellId, j, {
                type: "cancelled",
                query: queries[j],
              })
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

          const result = await executeSingle(sql, perQuery.signal)
          updateCellResult(cellId, i, singleResultFromExec(result, sql))
          publishSchemaIfMutating(result.type)

          if (result.type === "error") {
            failedCount++
            for (let j = i + 1; j < queries.length; j++) {
              updateCellResult(cellId, j, {
                type: "cancelled",
                query: queries[j],
              })
            }
            break
          }
          successCount++
        }

        setScriptSummary(cellId, {
          successCount,
          failedCount,
          durationMs: Date.now() - startTime,
        })
      } finally {
        externalSignal?.removeEventListener("abort", onExternalAbort)
        abortControllersRef.current.delete(cellId)
        autoFocusRef.current.delete(cellId)
        setRunningCellIds((prev) => {
          const next = new Set(prev)
          next.delete(cellId)
          return next
        })
      }

      return failedCount === 0
    },
    [executeSingle, updateCell, updateCellResult, setScriptSummary],
  )

  const runCell = useCallback(
    async (
      cellId: string,
      sql?: string,
      externalSignal?: AbortSignal,
    ): Promise<boolean> => {
      const cell = cellsRef.current.find((c) => c.id === cellId)
      if (!cell) return false

      const queryText = sql ?? cell.value
      if (!queryText.trim()) return false
      if (externalSignal?.aborted) return false

      const queries = getQueriesFromText(queryText)
      if (queries.length > 1) {
        return runScript(cellId, queries, externalSignal)
      }

      const prior = abortControllersRef.current.get(cellId)
      prior?.forEach((c) => c.abort())

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
        const execResult = await executeSingle(queryText, ac.signal)
        const cellResult: CellResult = {
          results: [singleResultFromExec(execResult, queryText)],
          activeResultIndex: 0,
          timestamp: Date.now(),
        }
        updateCell(cellId, { result: cellResult })
        publishSchemaIfMutating(execResult.type)
        return execResult.type !== "error"
      } finally {
        externalSignal?.removeEventListener("abort", onExternalAbort)
        abortControllersRef.current.delete(cellId)
        setRunningCellIds((prev) => {
          const next = new Set(prev)
          next.delete(cellId)
          return next
        })
      }
    },
    [cellsRef, executeSingle, updateCell, runScript],
  )

  const cancelCell = useCallback(
    (cellId: string) => {
      const controllers = abortControllersRef.current.get(cellId)
      if (!controllers) return
      controllers.forEach((ac) => ac.abort())
      markCancelledAll(cellId)
    },
    [markCancelledAll],
  )

  const cancelQuery = useCallback(
    (cellId: string, index: number) => {
      const controllers = abortControllersRef.current.get(cellId)
      if (!controllers || !controllers[index]) return
      controllers[index].abort()
      markCancelledOne(cellId, index)
    },
    [markCancelledOne],
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
    },
    [updateCells],
  )

  useEffect(() => {
    const controllersMap = abortControllersRef.current
    return () => {
      controllersMap.forEach((list) => list.forEach((c) => c.abort()))
      controllersMap.clear()
    }
  }, [])

  return {
    runningCellIds,
    runCell,
    cancelCell,
    cancelQuery,
    setActiveResultIndex,
  }
}
