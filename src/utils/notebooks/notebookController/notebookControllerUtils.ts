import type { NotebookViewState } from "../../../store/notebook"
import { NotebookToolError } from "../notebookToolError"
import { enqueueBufferTask } from "../notebookBufferQueue"
import {
  cancelPendingSearchPublish,
  readNotebookView,
} from "../notebookDexieView"
import { forgetHeadlessRuns } from "../notebookHeadlessRun"
import { forgetBufferSeq } from "../notebookAIBridge"
import type { NotebookController } from "./notebookController"
import {
  claimLive,
  claimMounting,
  forgetBufferOwnership,
  getMountEpoch,
  releaseBufferEpoch,
  releaseLive,
  releaseMounting,
  __resetBufferOwnershipForTests,
} from "./bufferOwnership"

export { getBufferMode, isBufferClaimed } from "./bufferOwnership"

type Waiter = {
  resolve: (c: NotebookController) => void
  reject: (e: Error) => void
  timer: ReturnType<typeof setTimeout>
  // Removes any AbortSignal listener attached when the waiter was created.
  // Called on resolve / timeout / abort so we never leak listeners.
  cleanup?: () => void
}

const controllers = new Map<number, NotebookController>()
const waiters = new Map<number, Waiter[]>()

// Thrown into pending waiters when a claim is released without a controller —
// withBoundNotebook catches it and falls back to the Dexie route.
export class MountClaimReleasedError extends NotebookToolError {
  constructor(bufferId: number) {
    super(
      "activation_failed",
      `Notebook ${bufferId} closed before it finished mounting. Retry this tool.`,
    )
  }
}

const rejectWaiters = (bufferId: number, error: Error): void => {
  const pending = waiters.get(bufferId)
  if (!pending) return
  waiters.delete(bufferId)
  for (const w of pending) {
    clearTimeout(w.timer)
    w.cleanup?.()
    w.reject(error)
  }
}

// Claims the buffer for the live side SYNCHRONOUSLY, then reads the mount seed
// through the buffer's queue — FIFO guarantees the seed contains every agent
// write committed before the claim, and the claim reroutes every later agent op
// to `waitForController`. Resolves the typed NotebookToolError (and releases the
// claim) when the buffer is gone, archived, or not a notebook, so the mount UI
// can show its reason; rejects on a real read failure so the caller can offer a
// retry instead of a silently blank notebook.
export const beginNotebookMount = async (
  bufferId: number,
): Promise<NotebookViewState | NotebookToolError> => {
  const epoch = claimMounting(bufferId)
  try {
    return await enqueueBufferTask(bufferId, () => readNotebookView(bufferId))
  } catch (error) {
    // Only cancel if no newer mount attempt superseded this one.
    if (getMountEpoch(bufferId) === epoch) {
      cancelNotebookMount(bufferId)
    }
    if (error instanceof NotebookToolError) return error
    throw error
  }
}

// Releases a claim that never became a mounted provider (tab switched away
// before the seed resolved). A no-op once registerController has set the buffer live.
export const cancelNotebookMount = (bufferId: number): void => {
  if (releaseMounting(bufferId)) {
    rejectWaiters(bufferId, new MountClaimReleasedError(bufferId))
  }
}

export const forgetBuffer = (bufferId: number): void => {
  forgetBufferSeq(bufferId)
  forgetBufferOwnership(bufferId)
  rejectWaiters(bufferId, new MountClaimReleasedError(bufferId))
  cancelPendingSearchPublish(bufferId)
  forgetHeadlessRuns(bufferId)
}

export const releaseArchivedBuffer = (bufferId: number): void => {
  releaseBufferEpoch(bufferId)
  rejectWaiters(bufferId, new MountClaimReleasedError(bufferId))
  cancelPendingSearchPublish(bufferId)
}

export const registerController = (controller: NotebookController): void => {
  controllers.set(controller.bufferId, controller)
  claimLive(controller.bufferId)
  const pending = waiters.get(controller.bufferId)
  if (pending && pending.length > 0) {
    for (const w of pending) {
      clearTimeout(w.timer)
      w.cleanup?.()
      w.resolve(controller)
    }
    waiters.delete(controller.bufferId)
  }
}

export const unregisterController = (bufferId: number): void => {
  controllers.delete(bufferId)
  if (releaseLive(bufferId)) {
    rejectWaiters(bufferId, new MountClaimReleasedError(bufferId))
  }
}

export const getController = (
  bufferId: number,
): NotebookController | undefined => controllers.get(bufferId)

export const waitForController = (
  bufferId: number,
  timeoutMs = 3000,
  signal?: AbortSignal,
): Promise<NotebookController> => {
  const existing = controllers.get(bufferId)
  if (existing) return Promise.resolve(existing)
  if (signal?.aborted) {
    return Promise.reject(new DOMException("Aborted", "AbortError"))
  }
  return new Promise<NotebookController>((resolve, reject) => {
    const removeFromWaiters = () => {
      const list = waiters.get(bufferId)
      if (!list) return
      const filtered = list.filter((w) => w.timer !== timer)
      if (filtered.length === 0) waiters.delete(bufferId)
      else waiters.set(bufferId, filtered)
    }
    const onAbort = () => {
      clearTimeout(timer)
      removeFromWaiters()
      reject(new DOMException("Aborted", "AbortError"))
    }
    const cleanup = signal
      ? () => signal.removeEventListener("abort", onAbort)
      : undefined
    const timer = setTimeout(() => {
      cleanup?.()
      removeFromWaiters()
      reject(
        new NotebookToolError(
          "activation_failed",
          `Notebook ${bufferId} did not finish mounting within ${timeoutMs}ms. Retry this tool.`,
        ),
      )
    }, timeoutMs)
    signal?.addEventListener("abort", onAbort, { once: true })
    const list = waiters.get(bufferId) ?? []
    list.push({ resolve, reject, timer, cleanup })
    waiters.set(bufferId, list)
  })
}

// Test-only reset. Clears the registry / mount-claim slots so vitest runs start
// clean; the coordination slots are cleared by __resetNotebookAIBridgeForTests.
export const __resetNotebookControllerForTests = (): void => {
  for (const [, list] of waiters) {
    for (const w of list) {
      clearTimeout(w.timer)
      w.cleanup?.()
      w.reject(new Error("Controller reset"))
    }
  }
  controllers.clear()
  waiters.clear()
  __resetBufferOwnershipForTests()
}
