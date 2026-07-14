import type { CellMode } from "../../store/notebook"
import type { RanStatus } from "../ai/runStatus"
import type { Client } from "../questdb/client"

// Agent↔user coordination for notebooks (no React, no controller internals):
//
//   - freshness seq   — a per-buffer counter that advances only on USER edits,
//                       so the dispatch gate can reject an agent write that
//                       raced a user change it never read.
//   - user-action bus — emitUserAction / on, consumed by the AI conversation
//                       layer to narrate what the user did.
//   - workspace       — cross-notebook ops (create/duplicate/delete/activate),
//                       registered by NotebookWorkspaceBridge.
//   - agent deps      — the reconnect-safe quest client accessor.
//
// The controllers themselves (live + Dexie) and the mount/route machinery live
// in notebookController.ts, which reads getBufferActionSeq / getAgentQuest from
// here. This module never imports from there — the dependency is one-way.

// === Workspace (cross-notebook operations) ==================================

type CreateNotebookOptions = {
  label?: string
  signal?: AbortSignal
}

type DuplicateNotebookOptions = {
  bufferId: number
  signal?: AbortSignal
}

export type NotebookWorkspaceController = {
  createNotebook: (
    options: CreateNotebookOptions,
  ) => Promise<{ bufferId: number; label: string }>
  duplicateNotebook: (
    options: DuplicateNotebookOptions,
  ) => Promise<{ bufferId: number; label: string }>
  deleteNotebook: (bufferId: number) => Promise<void>
  activateNotebook: (
    bufferId: number,
    cellToFocus: string | null | undefined,
  ) => Promise<boolean>
  listNotebookBuffers: () => Array<{
    bufferId: number
    label: string
    archived: boolean
  }>
}

let workspace: NotebookWorkspaceController | undefined

export const registerWorkspace = (
  controller: NotebookWorkspaceController,
): void => {
  workspace = controller
}

export const unregisterWorkspace = (): void => {
  workspace = undefined
}

export const getWorkspace = (): NotebookWorkspaceController | undefined =>
  workspace

// === Agent runtime deps =====================================================

type NotebookAgentDeps = {
  getQuest: () => Client
}

let agentDeps: NotebookAgentDeps | undefined

export const registerNotebookAgentDeps = (deps: NotebookAgentDeps): void => {
  agentDeps = deps
}

export const unregisterNotebookAgentDeps = (): void => {
  agentDeps = undefined
}

// Reconnect-safe: resolves the current quest client each call (undefined until
// the agent runtime registers). Read by the Dexie controller.
export const getAgentQuest = (): Client | undefined => agentDeps?.getQuest()

// === Freshness seq ==========================================================

// Per-buffer monotonic action sequence: a buffer's number advances only when the
// USER changes THAT buffer. So a mutation on X is "stale" iff X's seq advanced
// since the agent last read X — user activity in other tabs (or a tab switch)
// never stales X.
const bufferActionSeq = new Map<number, number>()
let seqTick = 0

const bumpBufferSeq = (bufferId: number): void => {
  seqTick += 1
  bufferActionSeq.set(bufferId, seqTick)
}

export const getBufferActionSeq = (bufferId: number): number =>
  bufferActionSeq.get(bufferId) ?? 0

// bufferId is the mounted notebook's buffer (always the active tab).
export const signalUserEdit = (bufferId: number): void => {
  bumpBufferSeq(bufferId)
}

// Drop the seq for a removed buffer. Called by notebookController.forgetBuffer,
// which also clears the mode claim and headless-run state.
export const forgetBufferSeq = (bufferId: number): void => {
  bufferActionSeq.delete(bufferId)
}

// === User-action event bus ==================================================

export type UserActionEvent =
  | { kind: "user_added_cell"; bufferId: number; cellId: string }
  | { kind: "user_deleted_cell"; bufferId: number; cellId: string }
  | { kind: "user_updated_cell"; bufferId: number; cellId: string }
  | {
      kind: "user_ran_cell"
      bufferId: number
      cellId: string
      status: RanStatus
    }
  | { kind: "user_moved_cell"; bufferId: number; cellId: string }
  | {
      kind: "user_duplicated_cell"
      bufferId: number
      cellId: string
      newCellId: string
    }
  | {
      kind: "user_changed_layout_mode"
      bufferId: number
      mode: "list" | "grid"
    }
  | {
      kind: "user_changed_cell_mode"
      bufferId: number
      cellId: string
      mode: CellMode
    }
  | { kind: "user_changed_grid_layout"; bufferId: number }
  | { kind: "user_archived_notebook"; bufferId: number }
  | { kind: "user_deleted_notebook"; bufferId: number }

type Listener = (evt: UserActionEvent) => void

const listeners = new Set<Listener>()

export const on = (_event: "user-action", cb: Listener): (() => void) => {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

export const emitUserAction = (evt: UserActionEvent): void => {
  // user_updated_cell is the debounced digest of typing that already staled the
  // buffer synchronously via signalUserEdit; re-bumping here would stale it
  // again at a later, misleading moment. Every other action is a structural
  // edit that stales its buffer.
  if (evt.kind !== "user_updated_cell") {
    bumpBufferSeq(evt.bufferId)
  }
  // Snapshot to guard against subscribers mutating the set during emit.
  for (const cb of Array.from(listeners)) {
    try {
      cb(evt)
    } catch (err) {
      // One bad subscriber must not break the others.
      console.warn("user-action listener failed", err)
    }
  }
}

// Test-only reset. Clears the coordination slots; the registry / mount slots
// are cleared by __resetNotebookControllerForTests.
export const __resetNotebookAIBridgeForTests = (): void => {
  listeners.clear()
  workspace = undefined
  agentDeps = undefined
  bufferActionSeq.clear()
  seqTick = 0
}
