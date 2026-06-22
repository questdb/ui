import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  resolveGetRecentUserActions,
  resolveGetWorkspaceState,
  type MetaToolContext,
} from "./metaResolvers"
import type { UserActionDigest } from "../../providers/AIConversationProvider/types"
import {
  __resetNotebookAIBridgeForTests,
  registerWorkspace,
  unregisterWorkspace,
} from "../notebookAIBridge"
import type { NotebookViewState } from "../../store/notebook"

const minimalWorkspace = (
  override: Partial<{
    notebookViewState: NotebookViewState
    label: string
    archived: boolean
  }> = {},
) => ({
  createNotebook: () =>
    Promise.resolve({ bufferId: 1, label: override.label ?? "n1" }),
  duplicateNotebook: () =>
    Promise.resolve({ bufferId: 2, label: `${override.label ?? "n1"} (copy)` }),
  deleteNotebook: () => Promise.resolve(),
  activateNotebook: () => Promise.resolve(true),
  getBufferMeta: () => ({
    kind: "active" as const,
    label: override.label ?? "n1",
    notebookViewState: override.notebookViewState ?? {
      cells: [],
      settings: { layoutMode: "list" as const },
    },
  }),
  listNotebookBuffers: () => [],
})

const emptyDigest = (): UserActionDigest => ({
  added: new Set(),
  deleted: new Set(),
  edited: new Set(),
  ran: new Map(),
})

beforeEach(() => {
  __resetNotebookAIBridgeForTests()
})

afterEach(() => {
  __resetNotebookAIBridgeForTests()
})

describe("resolveGetWorkspaceState", () => {
  it("returns no_notebook_open status when no active buffer", () => {
    const ctx: MetaToolContext = {
      getActiveBufferId: () => null,
      getWorkspace: () => null,
      getDigest: () => null,
    }
    const out = resolveGetWorkspaceState(undefined, ctx)
    expect(out).toHaveLength(1)
    expect(out[0].text).toMatch(/no_notebook_open/)
    expect(out[0].text).toMatch(/create_notebook/)
  })

  it("lists openable notebooks when active tab is not a notebook", () => {
    // Given the active tab is a SQL buffer but notebooks exist in the workspace
    const ctx: MetaToolContext = {
      getActiveBufferId: () => null,
      getWorkspace: () => ({
        notebooks: [
          { buffer_id: 2, label: "Trades", archived: false },
          { buffer_id: 5, label: "Latency", archived: false },
        ],
        active: { buffer_id: 9, label: "Query 1", kind: "sql" },
      }),
      getDigest: () => null,
    }

    // When workspace state is resolved
    const out = resolveGetWorkspaceState(undefined, ctx)

    // Then it surfaces the openable notebooks and how to target them by buffer_id
    expect(out[0].text).toMatch(/no_notebook_open/)
    expect(out[0].text).toContain("<workspace>")
    expect(out[0].text).toContain("Trades")
    expect(out[0].text).toContain("Latency")
    expect(out[0].text).toMatch(/buffer_id/)
  })

  it("returns workspace + notebook_context when buffer is active", () => {
    registerWorkspace(minimalWorkspace())
    const ctx: MetaToolContext = {
      getActiveBufferId: () => 1,
      getWorkspace: () => ({
        notebooks: [{ buffer_id: 1, label: "n1", archived: false }],
        active: { buffer_id: 1, label: "n1", kind: "notebook" },
      }),
      getDigest: () => null,
    }
    const out = resolveGetWorkspaceState(undefined, ctx)
    expect(out[0].text).toContain("<workspace>")
    expect(out[0].text).toContain("<notebook_context>")
    unregisterWorkspace()
  })

  it("appends user_events block when include_user_events is true", () => {
    registerWorkspace(minimalWorkspace())
    const digest = emptyDigest()
    digest.added.add("cell-1")
    const ctx: MetaToolContext = {
      getActiveBufferId: () => 1,
      getWorkspace: () => ({
        notebooks: [{ buffer_id: 1, label: "n1", archived: false }],
        active: { buffer_id: 1, label: "n1", kind: "notebook" },
      }),
      getDigest: () => digest,
    }
    const out = resolveGetWorkspaceState({ include_user_events: true }, ctx)
    expect(out[0].text).toContain("<user_events")
    expect(out[0].text).toContain("cell-1")
    unregisterWorkspace()
  })

  it("omits user_events block when include_user_events is false / unset", () => {
    registerWorkspace(minimalWorkspace())
    const ctx: MetaToolContext = {
      getActiveBufferId: () => 1,
      getWorkspace: () => null,
      getDigest: () => emptyDigest(),
    }
    const out = resolveGetWorkspaceState(undefined, ctx)
    expect(out[0].text).not.toContain("<user_events")
    unregisterWorkspace()
  })
})

describe("resolveGetRecentUserActions", () => {
  it("returns the empty placeholder when digest is null", () => {
    const ctx: MetaToolContext = {
      getActiveBufferId: () => 1,
      getWorkspace: () => null,
      getDigest: () => null,
    }
    const out = resolveGetRecentUserActions(ctx)
    expect(out[0].text).toMatch(/<user_events/)
    expect(out[0].text).toMatch(/no recent actions/)
  })

  it("returns the empty placeholder when digest is empty", () => {
    const ctx: MetaToolContext = {
      getActiveBufferId: () => 1,
      getWorkspace: () => null,
      getDigest: () => emptyDigest(),
    }
    const out = resolveGetRecentUserActions(ctx)
    expect(out[0].text).toMatch(/no recent actions/)
  })

  it("formats a non-empty digest", () => {
    const digest = emptyDigest()
    digest.added.add("cell-A")
    digest.deleted.add("cell-B")
    digest.ran.set("cell-A", "success")
    const ctx: MetaToolContext = {
      getActiveBufferId: () => 1,
      getWorkspace: () => null,
      getDigest: () => digest,
    }
    const out = resolveGetRecentUserActions(ctx)
    expect(out[0].text).toContain("cell-A")
    expect(out[0].text).toContain("cell-B")
    expect(out[0].text).toContain("success")
  })
})
