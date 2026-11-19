import { bufferStore, type Buffer } from "../../store/buffers"
import type { EditorContext } from "../../providers/EditorProvider"

// setActiveBuffer logs a failed switch and stays on the current tab, so a
// caller that must know confirms the switch from the store.
export const activateBuffer = async (
  setActiveBuffer: EditorContext["setActiveBuffer"],
  buffer: Buffer,
  options?: Parameters<EditorContext["setActiveBuffer"]>[1],
): Promise<void> => {
  await setActiveBuffer(buffer, options)
  if ((await bufferStore.getActiveId())?.value !== buffer.id)
    throw new Error("Could not open the tab.")
}
