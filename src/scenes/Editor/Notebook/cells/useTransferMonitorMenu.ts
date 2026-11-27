import { useEffect, useRef } from "react"
import {
  consumeTransferMonitor,
  subscribeTransferMonitor,
} from "../../../../utils/notebooks/notebookTransferState"
import { useNotebookBufferId } from "../NotebookProvider"

export const useTransferMonitorMenu = (
  cellId: string,
  enabled: boolean,
  onOpen: () => void,
) => {
  const bufferId = useNotebookBufferId()
  const onOpenRef = useRef(onOpen)
  onOpenRef.current = onOpen

  useEffect(() => {
    if (!enabled) return
    let frame = 0
    const openRequestedMenu = () => {
      cancelAnimationFrame(frame)
      // Let the header measure its width before choosing the inline control
      // or overflow menu; the initial expanded control may unmount immediately.
      frame = requestAnimationFrame(() => {
        if (consumeTransferMonitor(bufferId, cellId)) onOpenRef.current()
      })
    }
    openRequestedMenu()
    const unsubscribe = subscribeTransferMonitor(openRequestedMenu)
    return () => {
      cancelAnimationFrame(frame)
      unsubscribe()
    }
  }, [bufferId, cellId, enabled])
}
