import type { NotebookViewState } from "../../../store/notebook"
import { enqueueBufferTask } from "../notebookBufferQueue"
import { readNotebookView } from "../notebookDexieView"
import { getAgentQuest, getBufferActionSeq } from "../notebookAIBridge"
import {
  createDexieNotebookController,
  type NotebookController,
} from "./notebookController"
import {
  getController,
  isBufferClaimed,
  MountClaimReleasedError,
  waitForController,
} from "./notebookControllerUtils"

// The one door to the notebook-controller subsystem. Everything outside imports
// from here and nothing else. `withBoundNotebook` is the whole point: it hides
// whether a mutation lands on the live (mounted) or passive (Dexie) controller,
// so the AI-tool and UI layers stay controller-unaware. The registration /
// mount functions re-exported below are the live side's own bindings, used only
// by NotebookProvider and the mount component.

// Single checkpoint every mutating notebook tool runs through. A claimed buffer
// (mounting or mounted) routes to the live controller so edits appear
// immediately; anything else gets a Dexie controller whose queued ops surface
// deleted/archived/non-notebook buffers as typed errors — and NEVER steal
// focus. The optional `signal` rejects a pending `waitForController` and skips
// `fn` when the user aborts the AI turn.
export const withBoundNotebook = async <T>(
  bufferId: number,
  fn: (controller: NotebookController) => Promise<T>,
  signal?: AbortSignal,
): Promise<T> => {
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError")
  }
  if (isBufferClaimed(bufferId)) {
    try {
      const controller = await waitForController(bufferId, 3000, signal)
      return fn(controller)
    } catch (error) {
      // The claim was released before a controller appeared (tab switched
      // away mid-mount, or the buffer was deleted): the Dexie route below is
      // valid again, so serve the op there instead of failing it.
      if (!(error instanceof MountClaimReleasedError)) throw error
    }
  }
  return fn(
    createDexieNotebookController(
      bufferId,
      {
        isBufferClaimed: () => isBufferClaimed(bufferId),
        getQuest: getAgentQuest,
        getBufferSeq: () => getBufferActionSeq(bufferId),
      },
      signal,
    ),
  )
}

// Skips activation entirely — a read-only lookup must never move the user's tab.
// Mounted → the live controller is authoritative. Unmounted → a queued Dexie
// read, so the view reflects every committed agent write.
export const withBoundNotebookReadOnly = async <T>(
  bufferId: number,
  fn: (
    view: NotebookViewState,
    controller: NotebookController | undefined,
  ) => Promise<T>,
  signal?: AbortSignal,
): Promise<T> => {
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError")
  }
  const live = getController(bufferId)
  if (live) {
    return fn(await live.readView(), live)
  }
  const view = await enqueueBufferTask(bufferId, () =>
    readNotebookView(bufferId),
  )
  return fn(view, undefined)
}

// === Consumer API — the AI-tool / read layers use only these ================
export { getController } from "./notebookControllerUtils"
export type {
  NotebookController,
  RunCellSummary,
  ApplyNotebookStateRequest,
  ApplyNotebookStateCellRequest,
} from "./notebookController"

// === Live-implementation API — NotebookProvider / mount / workspace only ====
export {
  createNotebookController,
  __resetNotebookDexieControllerForTests,
} from "./notebookController"
export type { NotebookControllerActions } from "./notebookController"
export {
  beginNotebookMount,
  cancelNotebookMount,
  forgetBuffer,
  releaseArchivedBuffer,
  getBufferMode,
  registerController,
  unregisterController,
  waitForController,
  __resetNotebookControllerForTests,
} from "./notebookControllerUtils"

// Transition primitives the live provider composes in its own applyTransition.
export type { ViewParts } from "../notebookDexieView"
export {
  addCellTransition,
  applyNotebookStateTransition,
  deleteCellTransition,
  duplicateCellTransition,
  moveCellDownTransition,
  moveCellUpTransition,
  setCellChartConfigTransition,
  setCellLayoutTransition,
  setCellMaximizedTransition,
  setCellModeTransition,
  setCellViewMaximizedTransition,
  setLayoutModeTransition,
  updateCellTransition,
  type NotebookTransitionResult,
} from "./notebookTransitions"
