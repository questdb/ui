import { useEffect, useRef, useState } from "react"
import { toast } from "../components"
import { useEditor } from "../providers/EditorProvider"
import {
  bufferStore,
  MAX_BUFFER_NAME_LENGTH,
  type Buffer,
} from "../store/buffers"
import {
  deleteCellSnapshot,
  pruneToRecentNotebooks,
} from "../store/notebookResults"
import type { NotebookCell } from "../store/notebook"
import { buildPersistPayload } from "../scenes/Editor/Notebook/notebookUtils"
import { persistCellSnapshot } from "../scenes/Editor/Notebook/persistCellSnapshot"
import { withBoundNotebook } from "../utils/notebooks/notebookController"
import {
  appendTransferredCells,
  createTransferCells,
  createTransferView,
  type NotebookTransferSource,
  type TransferQuery,
} from "../utils/notebooks/notebookTransfer"
import {
  requestTransferMonitor,
  stageTransferSnapshot,
  takeTransferSnapshot,
} from "../utils/notebooks/notebookTransferState"
import { trackEvent } from "../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../modules/ConsoleEventTracker/events"
import { authSessionState } from "../modules/OAuth2/authSessionState"
import { SessionEndedError } from "../modules/OAuth2/session"
import { NotebookToolError } from "../utils/notebooks/notebookToolError"
import { notebookFailureReason } from "../utils/notebooks/notebookFailureReason"

export type NotebookTransferRequest = {
  queries: TransferQuery[]
  source: NotebookTransferSource
  sourceBuffer?: Buffer
  target?: Buffer
  monitor?: boolean
  compare?: boolean
}

export const useNotebookTransfer = () => {
  const { addBuffer, setActiveBuffer } = useEditor()
  const inFlight = useRef(false)
  const mounted = useRef(true)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const transfer = async (request: NotebookTransferRequest): Promise<void> => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    const session = authSessionState.capture()
    const abort = new AbortController()
    const unsubscribe = authSessionState.onEnd(() => abort.abort())
    const requireSession = () => {
      if (!session.isCurrent()) throw new SessionEndedError()
    }
    let target: Buffer | undefined
    let added = false
    let cells: NotebookCell[] = []
    let stage = "prepare"
    const trackFailure = (reason: string) => {
      if (!session.isCurrent()) return
      void trackEvent(ConsoleEvent.NOTEBOOK_TRANSFER_FAILED, {
        source: request.source,
        notebookId: target?.id,
        target: request.target ? "existing" : "new",
        stage,
        reason,
      })
    }
    try {
      cells = createTransferCells(request.queries)
      const view = createTransferView(cells, request.compare)
      const label =
        `${request.sourceBuffer?.label ?? "Query"} – notebook`.slice(
          0,
          MAX_BUFFER_NAME_LENGTH,
        )
      stage = "create"
      target =
        request.target ??
        (await addBuffer(
          {
            label,
            notebookViewState: buildPersistPayload(
              view.cells,
              view.focusedCellId ?? null,
              null,
              view.settings,
            ),
          },
          {
            activate: false,
            afterBufferId: request.sourceBuffer?.id,
            signal: abort.signal,
          },
        ))
      if (target?.id === undefined) {
        trackFailure("tab_limit")
        return
      }
      requireSession()
      const bufferId = target.id
      if (!request.target)
        void trackEvent(ConsoleEvent.NOTEBOOK_CREATE, {
          source: request.source,
          notebookId: bufferId,
        })
      stage = "persist_results"
      for (const cell of view.cells) {
        if (!cell.result) continue
        const snapshot = {
          bufferId,
          cellId: cell.id,
          results: cell.result.results,
          savedAt: Date.now(),
          activeResultIndex: 0,
        }
        const saved = await persistCellSnapshot(snapshot)
        requireSession()
        if (!saved) trackFailure("result_not_saved")
        stageTransferSnapshot(snapshot)
      }
      if (request.target) {
        stage = "append_cells"
        await withBoundNotebook(
          bufferId,
          (controller) =>
            controller.mutate((parts) => {
              requireSession()
              return appendTransferredCells(
                parts,
                view.cells,
                request.monitor === true,
              )
            }),
          abort.signal,
        )
      }
      added = true
      requireSession()
      if (request.target && !request.monitor) void pruneToRecentNotebooks()
      const firstCellId = cells[0].id
      if (request.monitor) requestTransferMonitor(bufferId, firstCellId)
      if (!request.target || request.monitor) {
        stage = "activate"
        // Re-read after the controller mutation so the mount receives the
        // appended cells and focus, not the target picker's older document.
        const current = await bufferStore.getById(bufferId)
        requireSession()
        if (!current || current.archived)
          throw new NotebookToolError(
            current ? "archived" : "deleted",
            "The destination notebook is no longer open.",
          )
        await setActiveBuffer(current, {
          focus: true,
          throwOnError: true,
        })
      }
      requireSession()
      void trackEvent(ConsoleEvent.NOTEBOOK_TRANSFER, {
        source: request.source,
        notebookId: bufferId,
        target: request.target ? "existing" : "new",
        cellCount: cells.length,
        capturedResults: cells.filter((c) => c.result != null).length,
      })
    } catch (error) {
      trackFailure(notebookFailureReason(error))
      if (!added && target?.id !== undefined && request.target) {
        await Promise.allSettled(
          cells.map((cell) => {
            takeTransferSnapshot(target!.id!, cell.id)
            return deleteCellSnapshot(target!.id!, cell.id)
          }),
        )
      }
      if (session.isCurrent())
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not add this work to a notebook.",
        )
    } finally {
      unsubscribe()
      inFlight.current = false
      if (mounted.current) setBusy(false)
    }
  }

  return { transfer, busy }
}
