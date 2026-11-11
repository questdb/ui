import type { Buffer } from "../../store/buffers"

// A browser that has never held any tab content: only the single empty SQL tab
// the store seeds on first open, nothing archived, nothing typed.
export const isFreshWorkspace = (buffers: Buffer[]): boolean =>
  buffers.length === 1 &&
  !buffers[0].archived &&
  buffers[0].value === "" &&
  buffers[0].notebookViewState == null &&
  buffers[0].metricsViewState == null &&
  buffers[0].templateId === undefined
