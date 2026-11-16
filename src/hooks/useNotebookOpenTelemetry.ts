import { useEffect, useRef } from "react"
import { trackEvent } from "../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../modules/ConsoleEventTracker/events"

// Notebook is keyed by buffer ID and live/preview mode. Count a successful
// activation (including page reload), never a rerender or an archive preview.
// Visibility returns also matter: a user can revisit tomorrow without closing
// the browser tab or switching the active notebook.
export const useNotebookOpenTelemetry = (
  notebookId: number | null,
  ready: boolean,
) => {
  const openedId = useRef<number | null>(null)
  useEffect(() => {
    if (notebookId === null || !ready) return
    const report = (trigger: "activation" | "visibility") => {
      openedId.current = notebookId
      void trackEvent(ConsoleEvent.NOTEBOOK_TAB_OPEN, { notebookId, trigger })
    }
    let hidden = typeof document !== "undefined" && document.hidden
    if (!hidden && openedId.current !== notebookId) report("activation")
    if (typeof document === "undefined") return
    const onVisibilityChange = () => {
      const nextHidden = document.hidden
      if (hidden && !nextHidden) report("visibility")
      hidden = nextHidden
    }
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () =>
      document.removeEventListener("visibilitychange", onVisibilityChange)
  }, [notebookId, ready])
}
