import { useCallback, useEffect, useRef } from "react"
import type { MutableRefObject } from "react"
import type { useEditor } from "../../../providers/EditorProvider"
import type { NotebookCell, NotebookSettings } from "../../../store/notebook"
import { enqueueBufferTask } from "../../../utils/notebooks/notebookBufferQueue"
import { buildPersistPayload as buildPersistPayloadPure } from "./notebookUtils"

const PERSIST_DEBOUNCE_MS = 300

type UpdateBuffer = ReturnType<typeof useEditor>["updateBuffer"]

type Options = {
  bufferId: number
  updateBuffer: UpdateBuffer
  focusedCellIdRef: MutableRefObject<string | null>
  maximizedCellIdRef: MutableRefObject<string | null>
  settingsRef: MutableRefObject<NotebookSettings>
}

// On unmount, flushes any pending debounced write via refs so a tab
// switch can't drop the last edit.
export const useNotebookPersistence = ({
  bufferId,
  updateBuffer,
  focusedCellIdRef,
  maximizedCellIdRef,
  settingsRef,
}: Options) => {
  const persistTimeoutRef = useRef<number | null>(null)
  const pendingCellsRef = useRef<NotebookCell[] | null>(null)
  const disposedRef = useRef(false)

  const buildPayload = useCallback(
    (cells: NotebookCell[]) =>
      buildPersistPayloadPure(
        cells,
        focusedCellIdRef.current,
        maximizedCellIdRef.current,
        settingsRef.current,
      ),
    [],
  )

  // Every write is a queued buffer task: zero contention while mounted (agent
  // ops route to the live controller), but the boundary writes — the unmount
  // flush above all — stay strictly ordered against later agent ops.
  const scheduleFlush = useCallback(() => {
    if (disposedRef.current) return
    if (persistTimeoutRef.current) {
      window.clearTimeout(persistTimeoutRef.current)
    }
    persistTimeoutRef.current = window.setTimeout(() => {
      const cells = pendingCellsRef.current
      pendingCellsRef.current = null
      persistTimeoutRef.current = null
      if (cells === null) return
      void enqueueBufferTask(bufferId, () =>
        updateBuffer(bufferId, {
          notebookViewState: buildPayload(cells),
        }),
      )
    }, PERSIST_DEBOUNCE_MS)
  }, [bufferId, updateBuffer, buildPayload])

  const persistCells = useCallback(
    (newCells: NotebookCell[]) => {
      pendingCellsRef.current = newCells
      scheduleFlush()
    },
    [scheduleFlush],
  )

  const persistDebounced = useCallback(
    (cells: NotebookCell[]) => {
      pendingCellsRef.current = pendingCellsRef.current ?? cells
      scheduleFlush()
    },
    [scheduleFlush],
  )

  const persistImmediately = useCallback(
    (cells: NotebookCell[], exact = false) => {
      if (disposedRef.current) return
      const effective = exact ? cells : (pendingCellsRef.current ?? cells)
      if (persistTimeoutRef.current) {
        window.clearTimeout(persistTimeoutRef.current)
        persistTimeoutRef.current = null
      }
      pendingCellsRef.current = null
      void enqueueBufferTask(bufferId, () =>
        updateBuffer(bufferId, {
          notebookViewState: buildPayload(effective),
        }),
      )
    },
    [bufferId, updateBuffer, buildPayload],
  )

  // Refs so the unmount-flush effect keeps stable deps and doesn't
  // re-fire on every parent render.
  const updateBufferRef = useRef(updateBuffer)
  updateBufferRef.current = updateBuffer
  const bufferIdRef = useRef(bufferId)
  bufferIdRef.current = bufferId

  const flushPending = useCallback(() => {
    if (persistTimeoutRef.current === null) return
    window.clearTimeout(persistTimeoutRef.current)
    persistTimeoutRef.current = null
    const cells = pendingCellsRef.current
    pendingCellsRef.current = null
    if (cells === null) return
    const bufferId = bufferIdRef.current
    void enqueueBufferTask(bufferId, () =>
      updateBufferRef.current(bufferId, {
        notebookViewState: buildPayload(cells),
      }),
    )
  }, [buildPayload])

  useEffect(() => {
    return () => {
      flushPending()
      disposedRef.current = true
    }
  }, [flushPending])

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flushPending()
    }
    window.addEventListener("pagehide", flushPending)
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => {
      window.removeEventListener("pagehide", flushPending)
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [flushPending])

  return { persistCells, persistImmediately, persistDebounced }
}
