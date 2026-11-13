import { createElement } from "react"
import Dexie from "dexie"
import { act, create, type ReactTestRenderer } from "react-test-renderer"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { bufferStore, type Buffer } from "../../../store/buffers"
import type { Client } from "../../../utils/questdb/client"
import {
  __resetNotebookAIBridgeForTests,
  requireWorkspace,
} from "../../../utils/notebooks/notebookAIBridge"
import { NotebookToolError } from "../../../utils/notebooks/notebookToolError"
import { sortPinnedBuffers } from "../../../utils/buffers/tabOrder"
import { createModelToolsClient } from "../../../utils/ai/aiAssistant"
import { dispatchTool } from "../../../utils/tools/dispatch"
import type { Permissions } from "../../../utils/tools/permissions"
import { NotebookWorkspaceBridge } from "./NotebookWorkspaceBridge"

// The bridge reads the editor through useEditor(); the test drives it with an
// in-memory editor whose mutations re-render the bridge, the way Dexie's live
// query re-renders it in the app.
const holder = vi.hoisted(() => ({ editor: undefined as unknown }))

vi.mock("../../../providers/EditorProvider", () => ({
  MAX_TABS: 100,
  useEditor: () => holder.editor,
}))

vi.mock("../../../providers/QuestProvider", async () => {
  const { createContext } = await import("react")
  return { QuestContext: createContext({ quest: undefined }) }
})

let renderer: ReactTestRenderer | undefined

const mountBridge = (initial: Buffer[], activeId: number) => {
  let buffers = initial
  let activeBufferId = activeId
  vi.spyOn(bufferStore, "getById").mockImplementation((id) =>
    Dexie.Promise.resolve(buffers.find((buffer) => buffer.id === id)),
  )

  const rerender = () => {
    holder.editor = snapshot()
    act(() => {
      renderer?.update(createElement(NotebookWorkspaceBridge))
    })
  }
  const patch = (id: number, fields: Partial<Buffer>) => {
    buffers = buffers.map((b) => (b.id === id ? { ...b, ...fields } : b))
  }
  // The provider compacts the open tabs' positions when one is removed.
  const compactOpenPositions = () => {
    sortPinnedBuffers(buffers).forEach((b, position) =>
      patch(b.id as number, { position }),
    )
  }

  const fns = {
    addBuffer: vi.fn(() => Promise.resolve(undefined)),
    duplicateNotebook: vi.fn(() => Promise.resolve(undefined)),
    setActiveBuffer: vi.fn((buffer: Buffer) => {
      activeBufferId = buffer.id as number
      rerender()
      return Promise.resolve()
    }),
    archiveBuffer: vi.fn((id: number) => {
      patch(id, { archived: true, archivedAt: Date.now(), position: -1 })
      compactOpenPositions()
      rerender()
      return Promise.resolve()
    }),
    deleteBuffer: vi.fn((id: number) => {
      buffers = buffers.filter((b) => b.id !== id)
      compactOpenPositions()
      rerender()
      return Promise.resolve()
    }),
    updateBuffer: vi.fn((id: number, fields: Partial<Buffer> = {}) => {
      patch(id, fields)
      rerender()
      return Promise.resolve()
    }),
  }

  function snapshot() {
    return {
      ...fns,
      buffers,
      activeBuffer: buffers.find((b) => b.id === activeBufferId) as Buffer,
    }
  }

  holder.editor = snapshot()
  act(() => {
    renderer = create(createElement(NotebookWorkspaceBridge))
  })

  return {
    ...fns,
    get buffers() {
      return buffers
    },
    get activeBufferId() {
      return activeBufferId
    },
    openOrder: () => sortPinnedBuffers(buffers).map((b) => b.id),
  }
}

const tab = (id: number, position: number, fields: Partial<Buffer> = {}) =>
  ({ id, label: `SQL ${id}`, value: "", position, ...fields }) as Buffer

const closedTab = (id: number, archivedAt: number) =>
  tab(id, -1, { archived: true, archivedAt })

const toolCode = (promise: Promise<unknown>) =>
  promise.then(
    () => "resolved",
    (error: unknown) =>
      error instanceof NotebookToolError ? error.code : String(error),
  )

beforeEach(() => {
  __resetNotebookAIBridgeForTests()
})

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
  holder.editor = undefined
  vi.restoreAllMocks()
})

describe("NotebookWorkspaceBridge — archiveTab", () => {
  it("closes an open tab on the agent's behalf", async () => {
    // Given three open tabs
    const editor = mountBridge([tab(1, 0), tab(2, 1), tab(3, 2)], 1)

    // When the agent closes the middle one
    await requireWorkspace().archiveTab(2)

    // Then it is archived on the agent's behalf
    expect(editor.archiveBuffer).toHaveBeenCalledTimes(1)
    expect(editor.archiveBuffer.mock.calls[0]).toEqual([2, "agent"])
    expect(editor.buffers.find((b) => b.id === 2)?.archived).toBe(true)
    expect(editor.openOrder()).toEqual([1, 3])
    expect(
      editor.buffers.filter((b) => !b.archived).map((b) => b.position),
    ).toEqual([0, 1])
  })

  it("refuses to close the only open tab", async () => {
    // Given one open tab and one closed tab
    const editor = mountBridge([tab(1, 0), closedTab(2, 10)], 1)

    // When the agent tries to close the open one
    const code = await toolCode(requireWorkspace().archiveTab(1))

    // Then the guard rejects it and nothing changes
    expect(code).toBe("last_tab")
    expect(editor.archiveBuffer).not.toHaveBeenCalled()
    expect(editor.openOrder()).toEqual([1])
  })

  it("refuses to close the only open tab while a closed tab is previewed", async () => {
    // Given one open tab and a closed tab under preview
    const editor = mountBridge(
      [tab(1, 0), tab(2, -1, { archived: true, isTemporary: true })],
      2,
    )

    // When the agent tries to close or delete the open tab
    const archived = await toolCode(requireWorkspace().archiveTab(1))
    const deleted = await toolCode(requireWorkspace().deleteTab(1))

    // Then the preview does not count as an open tab and both are rejected
    expect(archived).toBe("last_tab")
    expect(deleted).toBe("last_tab")
    expect(editor.archiveBuffer).not.toHaveBeenCalled()
    expect(editor.deleteBuffer).not.toHaveBeenCalled()
  })

  it("is a no-op for a tab that is already closed", async () => {
    // Given an open and a closed tab
    const editor = mountBridge([tab(1, 0), closedTab(2, 10)], 1)

    // When the agent closes the closed tab
    await requireWorkspace().archiveTab(2)

    // Then nothing is written
    expect(editor.archiveBuffer).not.toHaveBeenCalled()
  })

  it("reports an unknown tab as deleted", async () => {
    // Given a single tab
    mountBridge([tab(1, 0)], 1)

    // When the agent closes a tab that does not exist
    const code = await toolCode(requireWorkspace().archiveTab(99))

    // Then the agent learns it is gone
    expect(code).toBe("deleted")
  })
})

describe("NotebookWorkspaceBridge — AI suggestion tab", () => {
  it("is not a target for any tab tool", async () => {
    // Given two open tabs and the AI suggestion tab, which is active
    const editor = mountBridge(
      [tab(1, 0), tab(2, 1), tab(3, 2, { isPreviewBuffer: true })],
      3,
    )
    const workspace = requireWorkspace()

    // When the agent targets the suggestion tab with each tab tool
    const codes = await Promise.all([
      toolCode(workspace.archiveTab(3)),
      toolCode(workspace.deleteTab(3)),
      toolCode(workspace.restoreTab(3)),
      toolCode(workspace.activateTab(3)),
      toolCode(workspace.renameTab(3, "Mine")),
    ])

    // Then every call is rejected and the tab is left as it was
    expect(codes).toEqual([
      "deleted",
      "deleted",
      "deleted",
      "deleted",
      "deleted",
    ])
    expect(editor.archiveBuffer).not.toHaveBeenCalled()
    expect(editor.deleteBuffer).not.toHaveBeenCalled()
    expect(editor.updateBuffer).not.toHaveBeenCalled()
  })
})

describe("NotebookWorkspaceBridge — restoreTab", () => {
  it("reopens a closed tab as the last open tab", async () => {
    // Given two open tabs and a closed one
    const editor = mountBridge([tab(1, 0), tab(2, 1), closedTab(3, 10)], 1)

    // When the agent reopens it
    await requireWorkspace().restoreTab(3)

    // Then it is open again, after the existing tabs
    const restored = editor.buffers.find((b) => b.id === 3)
    expect(restored?.archived).toBe(false)
    expect(restored?.archivedAt).toBeUndefined()
    expect(restored?.isTemporary).toBeFalsy()
    expect(editor.openOrder()).toEqual([1, 2, 3])
  })

  it("is a no-op for a tab that is already open", async () => {
    // Given two open tabs
    const editor = mountBridge([tab(1, 0), tab(2, 1)], 1)

    // When the agent reopens an open tab
    await requireWorkspace().restoreTab(2)

    // Then nothing is written
    expect(editor.updateBuffer).not.toHaveBeenCalled()
    expect(editor.openOrder()).toEqual([1, 2])
  })
})

describe("NotebookWorkspaceBridge — activateTab", () => {
  it("switches to an open tab", async () => {
    // Given two open tabs with the first active
    const editor = mountBridge([tab(1, 0), tab(2, 1)], 1)

    // When the agent activates the second
    await requireWorkspace().activateTab(2)

    // Then the second tab is active
    expect(editor.activeBufferId).toBe(2)
  })

  it("does not re-activate the active tab", async () => {
    // Given an active tab
    const editor = mountBridge([tab(1, 0), tab(2, 1)], 1)

    // When the agent activates it again
    await requireWorkspace().activateTab(1)

    // Then the editor is left alone
    expect(editor.setActiveBuffer).not.toHaveBeenCalled()
  })

  it("refuses a closed tab and points the agent at restore_tab", async () => {
    // Given a closed tab
    const editor = mountBridge([tab(1, 0), closedTab(2, 10)], 1)

    // When the agent activates it
    const code = await toolCode(requireWorkspace().activateTab(2))

    // Then it is rejected without switching tabs
    expect(code).toBe("archived")
    expect(editor.activeBufferId).toBe(1)
  })
})

describe("NotebookWorkspaceBridge — renameTab", () => {
  it("stores the trimmed label", async () => {
    // Given an open tab
    const editor = mountBridge([tab(1, 0)], 1)

    // When the agent renames it with surrounding spaces
    await requireWorkspace().renameTab(1, "  Trades  ")

    // Then the trimmed label is stored
    expect(editor.buffers[0].label).toBe("Trades")
  })

  it("rejects blank and over-long labels", async () => {
    // Given an open tab
    const editor = mountBridge([tab(1, 0)], 1)

    // When the agent renames it to a blank or too long label
    const blank = await toolCode(requireWorkspace().renameTab(1, "   "))
    const long = await toolCode(
      requireWorkspace().renameTab(1, "x".repeat(101)),
    )

    // Then both are rejected and the label is kept
    expect(blank).toBe("validation")
    expect(long).toBe("validation")
    expect(editor.buffers[0].label).toBe("SQL 1")
  })
})

describe("NotebookWorkspaceBridge — deleteTab", () => {
  it("deletes an open tab on the agent's behalf", async () => {
    // Given three open tabs
    const editor = mountBridge([tab(1, 0), tab(2, 1), tab(3, 2)], 1)

    // When the agent deletes the first
    await requireWorkspace().deleteTab(1)

    // Then it is deleted on the agent's behalf (not reported as a user
    // deletion)
    expect(editor.deleteBuffer).toHaveBeenCalledTimes(1)
    expect(editor.deleteBuffer.mock.calls[0]).toEqual([1, true, "agent"])
    expect(editor.buffers.map((b) => b.id)).toEqual([2, 3])
  })

  it("deletes a closed tab without touching the open order", async () => {
    // Given one open tab and one closed tab
    const editor = mountBridge([tab(1, 0), closedTab(2, 10)], 1)

    // When the agent deletes the closed tab
    await requireWorkspace().deleteTab(2)

    // Then only the closed tab is removed, on the agent's behalf
    expect(editor.deleteBuffer.mock.calls[0]).toEqual([2, true, "agent"])
    expect(editor.buffers.map((b) => b.id)).toEqual([1])
  })

  it("refuses to delete the only open tab", async () => {
    // Given one open tab and one closed tab
    const editor = mountBridge([tab(1, 0), closedTab(2, 10)], 1)

    // When the agent deletes the open one
    const code = await toolCode(requireWorkspace().deleteTab(1))

    // Then the guard rejects it and nothing is deleted
    expect(code).toBe("last_tab")
    expect(editor.deleteBuffer).not.toHaveBeenCalled()
  })
})

describe("NotebookWorkspaceBridge — through the tool dispatcher", () => {
  const ALL_GRANTED: Permissions = {
    grantSchemaAccess: true,
    read: true,
    write: true,
  }
  const dqlValidator = () =>
    Promise.resolve({ query: "", columns: [], timestamp: 0 })
  const client = () => createModelToolsClient({} as Client, undefined, {})

  it("returns the last_tab guard to the agent as a tool error", async () => {
    // Given the mounted bridge with a single open tab
    const editor = mountBridge([tab(1, 0)], 1)

    // When the agent calls archive_tab on it
    const res = await dispatchTool(
      "archive_tab",
      { buffer_id: 1 },
      client(),
      () => undefined,
      ALL_GRANTED,
      dqlValidator,
    )

    // Then the agent gets the error code and the tab stays open
    expect(res.is_error).toBe(true)
    expect((JSON.parse(res.content) as { error_code: string }).error_code).toBe(
      "last_tab",
    )
    expect(editor.archiveBuffer).not.toHaveBeenCalled()
  })

  it("closes and reopens a tab end to end", async () => {
    // Given the mounted bridge with two open tabs
    const editor = mountBridge([tab(1, 0), tab(2, 1)], 1)

    // When the agent closes the first tab and reopens it
    const archived = await dispatchTool(
      "archive_tab",
      { buffer_id: 1 },
      client(),
      () => undefined,
      ALL_GRANTED,
      dqlValidator,
    )
    const restored = await dispatchTool(
      "restore_tab",
      { buffer_id: 1 },
      client(),
      () => undefined,
      ALL_GRANTED,
      dqlValidator,
    )

    // Then both succeed and the reopened tab is last
    expect(archived.is_error).toBeUndefined()
    expect(restored.is_error).toBeUndefined()
    expect(editor.openOrder()).toEqual([2, 1])
  })
})
