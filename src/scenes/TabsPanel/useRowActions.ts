import { useEditor } from "../../providers"
import type { Buffer } from "../../store/buffers"
import { trackEvent } from "../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../modules/ConsoleEventTracker/events"
import { sortPinnedBuffers } from "../../utils/buffers/tabOrder"
import { acceptRowActionClick } from "../../utils/buffers/rowActionClickGuard"
import { focusNeighbourRow } from "./keyboard"

// Close, Delete and Reopen of a Tabs panel row. The panel keeps keyboard
// focus: the neighbouring row takes it before the row goes away, and the
// editor is not focused when a tab is removed.
export const useRowActions = () => {
  const { buffers, closeBuffer, deleteBuffer, restoreBuffer, tabsDisabled } =
    useEditor()

  // Gate on every open tab, not the rows shown: a filter that hides the other
  // tabs must not disable Close/Delete (same rule as closeBuffer).
  const canRemove = !tabsDisabled && sortPinnedBuffers(buffers).length > 1

  const acceptAction = () => !tabsDisabled && acceptRowActionClick()

  const close = async (buffer: Buffer, action: Element) => {
    if (!acceptAction()) return
    void trackEvent(ConsoleEvent.TAB_PANEL_CLOSE)
    focusNeighbourRow(action)
    await closeBuffer(buffer.id as number, { focus: false })
  }

  const remove = async (buffer: Buffer, action: Element) => {
    if (!acceptAction()) return
    void trackEvent(ConsoleEvent.TAB_PANEL_DELETE)
    focusNeighbourRow(action)
    await deleteBuffer(buffer.id as number, { focus: false })
  }

  const reopen = async (buffer: Buffer, action: Element) => {
    if (!acceptAction()) return
    void trackEvent(ConsoleEvent.TAB_PANEL_RESTORE)
    focusNeighbourRow(action)
    await restoreBuffer(buffer.id as number, { focus: false })
  }

  return { canRemove, tabsDisabled, close, remove, reopen }
}

export type RowActionHandlers = ReturnType<typeof useRowActions>
