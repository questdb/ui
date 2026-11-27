import { useCallback } from "react"
import { trackEvent } from "../../../modules/ConsoleEventTracker"
import type { ConsoleEvent } from "../../../modules/ConsoleEventTracker/events"
import { useNotebookBufferId } from "./NotebookProvider"

// Bind to the owning notebook, never the globally active tab. Drawer callbacks
// and async cell actions can outlive a tab switch.
export const useNotebookTelemetry = (cellId?: string) => {
  const notebookId = useNotebookBufferId()
  return useCallback(
    (event: ConsoleEvent, payload?: Record<string, unknown>) =>
      trackEvent(event, {
        ...payload,
        notebookId,
        ...(cellId !== undefined ? { cellId } : {}),
      }),
    [notebookId, cellId],
  )
}
