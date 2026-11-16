import { bufferStore } from "../../store/buffers"
import { buildPersistPayload } from "../../scenes/Editor/Notebook/notebookUtils"
import { getController } from "../notebooks/notebookController"
import { enqueueBufferTask } from "../notebooks/notebookBufferQueue"
import { getBufferActionSeq } from "../notebooks/notebookAIBridge"
import { isUnmodifiedMonitoring } from "./dashboard"
import { hasNotebookBufferLayouts } from "../../scenes/Editor/Notebook/notebookColumnLayoutStore"

// Close must inspect live content too: a just-typed edit may not have reached
// the debounced persistence yet. If that inspection fails, archive safely.
export const closeUnmodifiedMonitoring = async (
  id: number,
  remove: () => Promise<void>,
): Promise<boolean> => {
  const liveAtClose = getController(id)
  const sequence = getBufferActionSeq(id)
  return enqueueBufferTask(id, async () => {
    const current = await bufferStore.getById(id)
    if (!current?.monitoring || current.archived) return false
    try {
      const live = getController(id) ?? liveAtClose
      const view = (await live?.readView()) ?? current.notebookViewState
      if (!view || sequence !== getBufferActionSeq(id)) return false
      // Column widths, ordering and frozen columns live outside the notebook
      // document, but are still user customization that must survive closing.
      if (
        isUnmodifiedMonitoring(current, view) &&
        !hasNotebookBufferLayouts(id)
      ) {
        await remove()
        return true
      }
      if (live) {
        await bufferStore.update(id, {
          notebookViewState: buildPersistPayload(
            view.cells,
            view.focusedCellId ?? null,
            view.maximizedCellId ?? null,
            view.settings,
          ),
        })
      }
    } catch {
      // An unreadable document is never evidence that it can be discarded.
    }
    return false
  })
}
