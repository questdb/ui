import "../../test/stubBrowserGlobals"
import { describe, it, expect, beforeEach } from "vitest"

import {
  __resetNotebookAIBridgeForTests,
  emitUserAction,
  getBufferActionSeq,
  getWorkspace,
  on,
  registerWorkspace,
  unregisterWorkspace,
  type NotebookWorkspaceController,
  type UserActionEvent,
} from "./notebookAIBridge"
import { __resetNotebookControllerForTests } from "./notebookController"
import { __resetNotebookBufferQueuesForTests } from "./notebookBufferQueue"
import { __resetNotebookDexieControllerForTests } from "./notebookController"
import { db } from "../../store/db"

const makeWorkspace = (
  overrides: Partial<NotebookWorkspaceController> = {},
): NotebookWorkspaceController => ({
  createNotebook: ({ label }) =>
    Promise.resolve({ bufferId: 1, label: label ?? "Notebook" }),
  duplicateNotebook: ({ bufferId }) =>
    Promise.resolve({ bufferId, label: "Notebook (copy)" }),
  archiveTab: () => Promise.resolve(),
  restoreTab: () => Promise.resolve(),
  activateTab: () => Promise.resolve(),
  renameTab: () => Promise.resolve(),
  deleteTab: () => Promise.resolve(),
  activateNotebook: () => Promise.resolve(true),
  listNotebookBuffers: () => [],
  ...overrides,
})

beforeEach(async () => {
  __resetNotebookControllerForTests()
  __resetNotebookAIBridgeForTests()
  __resetNotebookBufferQueuesForTests()
  __resetNotebookDexieControllerForTests()
  await db.buffers.clear()
})

describe("workspace registry", () => {
  it("registerWorkspace replaces the prior workspace", () => {
    const a = makeWorkspace()
    const b = makeWorkspace()
    registerWorkspace(a)
    registerWorkspace(b)
    expect(getWorkspace()).toBe(b)
  })

  it("unregisterWorkspace clears it", () => {
    registerWorkspace(makeWorkspace())
    unregisterWorkspace()
    expect(getWorkspace()).toBeUndefined()
  })
})

describe("emitUserAction / on", () => {
  it("fans out events to every subscriber", () => {
    const seen: UserActionEvent[][] = [[], []]
    on("user-action", (e) => seen[0].push(e))
    on("user-action", (e) => seen[1].push(e))
    const evt: UserActionEvent = {
      kind: "user_added_cell",
      bufferId: 1,
      cellId: "c",
    }
    emitUserAction(evt)
    expect(seen[0]).toEqual([evt])
    expect(seen[1]).toEqual([evt])
  })

  it("returned unsubscribe removes the listener", () => {
    const seen: UserActionEvent[] = []
    const off = on("user-action", (e) => seen.push(e))
    off()
    emitUserAction({ kind: "user_added_cell", bufferId: 1, cellId: "c" })
    expect(seen).toEqual([])
  })

  it("a throwing subscriber does not break other subscribers", () => {
    const seen: UserActionEvent[] = []
    on("user-action", () => {
      throw new Error("boom")
    })
    on("user-action", (e) => seen.push(e))
    emitUserAction({ kind: "user_added_cell", bufferId: 1, cellId: "c" })
    expect(seen).toHaveLength(1)
  })
})

describe("emitUserAction — freshness seq", () => {
  beforeEach(() => __resetNotebookAIBridgeForTests())

  it("does not advance the buffer seq for a cell-typing digest", () => {
    // Given typing already staled the buffer synchronously via signalUserEdit
    const before = getBufferActionSeq(1)

    // When the debounced user_updated_cell digest fires
    emitUserAction({ kind: "user_updated_cell", bufferId: 1, cellId: "c" })

    // Then it does not stale the buffer a second time
    expect(getBufferActionSeq(1)).toBe(before)
  })

  it("advances the buffer seq for every structural user action", () => {
    // Given the structural user actions that must stale a racing agent write
    const structural: UserActionEvent[] = [
      { kind: "user_added_cell", bufferId: 1, cellId: "c" },
      { kind: "user_deleted_cell", bufferId: 1, cellId: "c" },
      { kind: "user_moved_cell", bufferId: 1, cellId: "c" },
      {
        kind: "user_duplicated_cell",
        bufferId: 1,
        cellId: "c",
        newCellId: "d",
      },
      { kind: "user_ran_cell", bufferId: 1, cellId: "c", status: "success" },
      { kind: "user_changed_layout_mode", bufferId: 1, mode: "grid" },
      {
        kind: "user_changed_cell_mode",
        bufferId: 1,
        cellId: "c",
        mode: "draw",
      },
      { kind: "user_changed_grid_layout", bufferId: 1 },
      {
        kind: "user_archived_tab",
        bufferId: 1,
        tabKind: "notebook",
        label: "N",
      },
      {
        kind: "user_deleted_tab",
        bufferId: 1,
        tabKind: "notebook",
        label: "N",
      },
    ]

    // When / Then each action advances the seq
    for (const evt of structural) {
      const before = getBufferActionSeq(1)
      emitUserAction(evt)
      expect(getBufferActionSeq(1)).toBeGreaterThan(before)
    }
  })
})
