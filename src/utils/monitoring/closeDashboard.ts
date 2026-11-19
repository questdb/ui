import { bufferStore } from "../../store/buffers"
import { aiConversationStore } from "../../store/aiConversations"
import { buildPersistPayload } from "../../scenes/Editor/Notebook/notebookUtils"
import { getController } from "../notebooks/notebookController"
import { enqueueBufferTask } from "../notebooks/notebookBufferQueue"
import { getBufferActionSeq } from "../notebooks/notebookAIBridge"
import { examplePersonalizationReason } from "../examples/examplePersonalization"
import { isMonitoringDashboard } from "./identity"

// Like closing an example dashboard: an unedited dashboard is deleted, an
// edited one is archived. Close must inspect live content too: a just-typed
// edit may not have reached the debounced persistence yet. If that inspection
// fails, archive safely. Resolves true when the dashboard was deleted.
export const closeUnmodifiedMonitoring = async (
  id: number,
  remove: () => Promise<void>,
): Promise<boolean> => {
  const liveAtClose = getController(id)
  const sequence = getBufferActionSeq(id)
  return enqueueBufferTask(id, async () => {
    // Pending document writes settle first: an edit may just have removed
    // the template link.
    const current = await bufferStore.getById(id)
    if (!current || current.archived || !isMonitoringDashboard(current))
      return false
    try {
      const live = getController(id) ?? liveAtClose
      const view = (await live?.readView()) ?? current.notebookViewState
      if (!view || sequence !== getBufferActionSeq(id)) return false
      if (examplePersonalizationReason(current, { notebookViewState: view })) {
        // Save the live document, so closing before the debounce fires
        // cannot discard an edit. The write also detaches the template.
        await bufferStore.update(id, {
          notebookViewState: buildPersistPayload(
            view.cells,
            // The live view carries no focus; keep the stored one.
            view.focusedCellId ??
              current.notebookViewState?.focusedCellId ??
              null,
            view.maximizedCellId ?? null,
            view.settings,
          ),
        })
        return false
      }
      // An AI chat about this dashboard must keep a notebook to point at.
      if (await aiConversationStore.hasNotebookConversation(id)) return false
      await remove()
      return true
    } catch {
      // An unreadable document is never evidence that it can be discarded.
      return false
    }
  })
}
