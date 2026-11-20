import { useEffect, useReducer } from "react"
import { toast } from "../components"
import { useEditor } from "../providers/EditorProvider"
import { bufferStore, MAX_BUFFER_NAME_LENGTH } from "../store/buffers"
import { buildPersistPayload } from "../scenes/Editor/Notebook/notebookUtils"
import { persistCellSnapshot } from "../scenes/Editor/Notebook/persistCellSnapshot"
import {
  createTransferCells,
  createTransferView,
  type NotebookTransferSource,
  type TransferQuery,
} from "../utils/notebooks/notebookTransfer"
import {
  markTransferSnapshotWritten,
  requestTransferMonitor,
  stageTransferSnapshot,
} from "../utils/notebooks/notebookTransferState"
import { trackEvent } from "../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../modules/ConsoleEventTracker/events"
import { authSessionState } from "../modules/OAuth2/authSessionState"
import { SessionEndedError } from "../modules/OAuth2/session"
import { NotebookToolError } from "../utils/notebooks/notebookToolError"
import { notebookFailureReason } from "../utils/notebooks/notebookFailureReason"
import { useEditorBusy } from "./useEditorBusy"

// Transfers always create a new notebook next to the source tab.
export type NotebookTransferRequest = {
  queries: TransferQuery[]
  source: NotebookTransferSource
  // The tab the transferred work came from: names the notebook and places it
  // next to that tab.
  sourceBufferId?: number
  monitor?: boolean
  compare?: boolean
}

// One transfer at a time, shared by every instance: "Convert to notebook"
// lives in a menu that unmounts when the item is selected, and the item shown
// when the menu reopens must still see the transfer in progress.
let transferBusy = false
const transferListeners = new Set<() => void>()
const setTransferBusy = (busy: boolean) => {
  transferBusy = busy
  transferListeners.forEach((listener) => listener())
}

export const useNotebookTransfer = () => {
  const { addBuffer, buffers, setActiveBuffer } = useEditor()
  const isEditorBusy = useEditorBusy()
  const [, rerender] = useReducer((count: number) => count + 1, 0)
  const busy = transferBusy
  useEffect(() => {
    transferListeners.add(rerender)
    // A transfer may have ended between this render and the subscription.
    if (transferBusy !== busy) rerender()
    return () => {
      transferListeners.delete(rerender)
    }
  }, [])

  const transfer = async (request: NotebookTransferRequest): Promise<void> => {
    if (transferBusy) return
    setTransferBusy(true)
    const session = authSessionState.capture()
    const abort = new AbortController()
    const unsubscribe = authSessionState.onEnd(() => abort.abort())
    const requireSession = () => {
      if (!session.isCurrent()) throw new SessionEndedError()
    }
    let notebookId: number | undefined
    let stage = "prepare"
    const trackFailure = (reason: string) => {
      if (!session.isCurrent()) return
      void trackEvent(ConsoleEvent.NOTEBOOK_TRANSFER_FAILED, {
        source: request.source,
        notebookId,
        stage,
        reason,
      })
    }
    try {
      const cells = createTransferCells(request.queries)
      const view = createTransferView(cells, request.compare)
      const sourceBuffer = buffers.find(
        (buffer) => buffer.id === request.sourceBufferId,
      )
      const label = `${sourceBuffer?.label ?? "Query"} – notebook`.slice(
        0,
        MAX_BUFFER_NAME_LENGTH,
      )
      stage = "create"
      const created = await addBuffer(
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
          afterBufferId: sourceBuffer?.id,
          signal: abort.signal,
        },
      )
      if (created?.id === undefined) {
        trackFailure("tab_limit")
        return
      }
      requireSession()
      const bufferId = created.id
      notebookId = bufferId
      void trackEvent(ConsoleEvent.NOTEBOOK_CREATE, {
        source: request.source,
        notebookId: bufferId,
      })
      const savedAt = Date.now()
      const snapshots = view.cells.flatMap((cell) =>
        cell.result
          ? [
              {
                bufferId,
                cellId: cell.id,
                results: cell.result.results,
                savedAt,
                activeResultIndex: 0,
              },
            ]
          : [],
      )
      // The tab is already in the tab bar and can be opened while the results
      // are written. Stage every result before the first write, in this same
      // continuation: a notebook that mounts mid-write then finds all of them,
      // and never marks a not-yet-written cell's result as missing.
      snapshots.forEach(stageTransferSnapshot)
      stage = "persist_results"
      for (const snapshot of snapshots) {
        const saved = await persistCellSnapshot(snapshot)
        requireSession()
        if (saved)
          markTransferSnapshotWritten(snapshot.bufferId, snapshot.cellId)
        else trackFailure("result_not_saved")
      }
      if (request.monitor) requestTransferMonitor(bufferId, cells[0].id)
      stage = "activate"
      const current = await bufferStore.getById(bufferId)
      requireSession()
      if (!current || current.archived)
        throw new NotebookToolError(
          current ? "archived" : "deleted",
          "The destination notebook is no longer open.",
        )
      // A script or query started while the results were saved would be
      // aborted by switching away from the editor. The notebook stays in the
      // tab bar instead.
      if (isEditorBusy()) {
        trackFailure("editor_running")
        toast.info(
          `${current.label} is ready. Open its tab once the editor finishes running.`,
        )
        return
      }
      await setActiveBuffer(current, { focus: true })
      requireSession()
      void trackEvent(ConsoleEvent.NOTEBOOK_TRANSFER, {
        source: request.source,
        notebookId: bufferId,
        cellCount: cells.length,
        capturedResults: cells.filter((c) => c.result != null).length,
      })
    } catch (error) {
      trackFailure(notebookFailureReason(error))
      if (session.isCurrent())
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not add this work to a notebook.",
        )
    } finally {
      unsubscribe()
      setTransferBusy(false)
    }
  }

  return { transfer, busy }
}
