import { useCallback, useEffect, useRef } from "react"
import type { MutableRefObject } from "react"
import type { useEditor } from "../../../providers/EditorProvider"
import type { NotebookCell, NotebookSettings } from "../../../store/notebook"
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

  const buildPayload = useCallback(
    (cells: NotebookCell[]) =>
      buildPersistPayloadPure(
        cells,
        focusedCellIdRef.current,
        maximizedCellIdRef.current,
        settingsRef.current,
      ),
    [focusedCellIdRef, maximizedCellIdRef, settingsRef],
  )

  const persistCells = useCallback(
    (newCells: NotebookCell[]) => {
      pendingCellsRef.current = newCells
      if (persistTimeoutRef.current) {
        window.clearTimeout(persistTimeoutRef.current)
      }
      persistTimeoutRef.current = window.setTimeout(() => {
        const cells = pendingCellsRef.current ?? newCells
        void updateBuffer(bufferId, {
          notebookViewState: buildPayload(cells),
        })
        pendingCellsRef.current = null
        persistTimeoutRef.current = null
      }, PERSIST_DEBOUNCE_MS)
    },
    [bufferId, updateBuffer, buildPayload],
  )

  const persistImmediately = useCallback(
    (cells: NotebookCell[]) => {
      if (persistTimeoutRef.current) {
        window.clearTimeout(persistTimeoutRef.current)
        persistTimeoutRef.current = null
      }
      pendingCellsRef.current = null
      void updateBuffer(bufferId, {
        notebookViewState: buildPayload(cells),
      })
    },
    [bufferId, updateBuffer, buildPayload],
  )

  // Refs so the unmount-flush effect keeps stable deps and doesn't
  // re-fire on every parent render.
  const updateBufferRef = useRef(updateBuffer)
  updateBufferRef.current = updateBuffer
  const bufferIdRef = useRef(bufferId)
  bufferIdRef.current = bufferId

  useEffect(() => {
    return () => {
      if (persistTimeoutRef.current !== null) {
        window.clearTimeout(persistTimeoutRef.current)
        persistTimeoutRef.current = null
        const cells = pendingCellsRef.current
        pendingCellsRef.current = null
        if (cells === null) return
        void updateBufferRef.current(bufferIdRef.current, {
          notebookViewState: buildPayload(cells),
        })
      }
    }
  }, [buildPayload])

  return { persistCells, persistImmediately }
}
