import "../../test/stubBrowserGlobals"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { dispatchMCPTool, type DispatchContext } from "./dispatchMCPTool"
import {
  createNotebookFreshness,
  type NotebookFreshness,
} from "../notebooks/notebookFreshness"
import { db } from "../../store/db"
import { EXPECTED_BRIDGE_VERSION } from "./protocolVersion"
import type { ToolCallMessage } from "./types"
import type { ModelToolsClient } from "../ai/aiAssistant"
import type { MetaToolContext } from "./metaResolvers"
import type { UserActionDigest } from "../../providers/AIConversationProvider/types"
import {
  __resetNotebookAIBridgeForTests,
  emitUserAction,
  getBufferActionSeq,
  registerWorkspace,
  unregisterWorkspace,
} from "../notebooks/notebookAIBridge"

const isFresh = (freshness: NotebookFreshness, bufferId: number): boolean =>
  freshness.assertFresh(bufferId) === "fresh"

const emptyDigest = (): UserActionDigest => ({
  added: new Set(),
  deleted: new Set(),
  edited: new Set(),
  ran: new Map(),
})

const minimalMetaCtx = (): MetaToolContext => ({
  getActiveBufferId: () => 1,
  getWorkspace: () => ({
    notebooks: [{ buffer_id: 1, label: "n1", archived: false }],
    active: { buffer_id: 1, label: "n1", kind: "notebook" },
  }),
  getDigest: () => emptyDigest(),
})

const minimalWorkspace = () => ({
  createNotebook: () =>
    Promise.resolve({ bufferId: 1, label: "n1", activated: true }),
  duplicateNotebook: () =>
    Promise.resolve({ bufferId: 2, label: "n1 (copy)", activated: true }),
  deleteNotebook: () => Promise.resolve(),
  activateNotebook: () => Promise.resolve(true),
  getBufferMeta: () => ({
    kind: "active" as const,
    label: "n1",
    notebookViewState: {
      cells: [],
      settings: { layoutMode: "list" as const },
    },
  }),
  listNotebookBuffers: () => [],
})

const makeCall = (
  name: string,
  args: Record<string, unknown> = {},
): ToolCallMessage => ({
  v: EXPECTED_BRIDGE_VERSION,
  type: "tool_call",
  requestId: "r-" + name,
  name,
  arguments: args,
  deadlineMs: 15_000,
})

// `dispatchTool` is the cross-cutting AI dispatch we want to spy on without
// faking the full ModelToolsClient. We mock the module to capture the call.
vi.mock("../tools/dispatch", async () => {
  const actual =
    await vi.importActual<typeof import("../tools/dispatch")>(
      "../tools/dispatch",
    )
  return {
    ...actual,
    dispatchTool: vi.fn(
      (
        name: string,
        _args: unknown,
      ): Promise<{ content: string; is_error?: boolean }> =>
        Promise.resolve({
          content: JSON.stringify({ ok: true, name }),
          is_error: false,
        }),
    ),
  }
})

import { dispatchTool as mockedDispatchTool } from "../tools/dispatch"

type Freshness = "unfetched" | "fresh" | "stale"

// Sets up the gate for buffer 1: "unfetched" records nothing; "fresh" records a
// read at the current seq; "stale" records a read and then bumps buffer 1's seq
// via a user edit so the recorded read no longer matches.
const ctx = (
  freshness: Freshness = "fresh",
  meta: MetaToolContext = minimalMetaCtx(),
): DispatchContext => {
  const gate = createNotebookFreshness()
  if (freshness === "fresh" || freshness === "stale") {
    gate.recordRead(1, getBufferActionSeq(1))
  }
  if (freshness === "stale") {
    emitUserAction({ kind: "user_added_cell", bufferId: 1, cellId: "u1" })
  }
  return {
    modelToolsClient: {} as unknown as ModelToolsClient,
    freshness: gate,
    metaToolContext: meta,
  }
}

beforeEach(async () => {
  __resetNotebookAIBridgeForTests()
  vi.mocked(mockedDispatchTool).mockClear()
  registerWorkspace(minimalWorkspace())
  await db.buffers.clear()
  await db.buffers.put({
    id: 1,
    label: "n1",
    value: "",
    position: 0,
    notebookViewState: { cells: [], settings: { layoutMode: "list" } },
  })
})

afterEach(() => {
  __resetNotebookAIBridgeForTests()
  unregisterWorkspace()
})

describe("dispatchMCPTool — meta tools", () => {
  it("get_workspace_state resolves locally and never calls dispatchTool", async () => {
    const c = ctx("unfetched")
    const out = await dispatchMCPTool(makeCall("get_workspace_state"), c)
    expect(out.isError).toBe(false)
    expect(out.content[0].text).toMatch(/<workspace>|<notebook_context>/)
    expect(vi.mocked(mockedDispatchTool)).not.toHaveBeenCalled()
  })

  it("get_workspace_state records the active buffer as fresh", async () => {
    const c = ctx("unfetched")
    await dispatchMCPTool(makeCall("get_workspace_state"), c)
    expect(isFresh(c.freshness, 1)).toBe(true)
  })

  // Digest-only read (IDs, no cell values) is not a full re-sync, so it must
  // leave a user-edit "stale" bit set — otherwise a later apply could overwrite
  // the very edit it just reported.
  it("get_recent_user_actions resolves locally and does NOT clear 'stale'", async () => {
    const c = ctx("stale")
    const out = await dispatchMCPTool(makeCall("get_recent_user_actions"), c)
    expect(out.isError).toBe(false)
    expect(out.content[0].text).toMatch(/<user_events/)
    expect(isFresh(c.freshness, 1)).toBe(false)
  })
})

describe("dispatchMCPTool — state-freshness gate", () => {
  const mutations = [
    "add_cell",
    "update_cell",
    "delete_cell",
    "duplicate_cell",
    "move_cell_up",
    "move_cell_down",
    "run_cell",
    "set_layout_mode",
    "set_cell_layout",
    "set_cell_mode",
    "set_cell_chart_config",
    "set_cell_autorefresh",
    "set_cell_view_maximized",
    "set_cell_maximized",
  ]

  it("rejects every mutation tool when the target buffer is unfetched", async () => {
    for (const name of mutations) {
      const c = ctx("unfetched")
      const out = await dispatchMCPTool(makeCall(name, { buffer_id: 1 }), c)
      expect(out.isError).toBe(true)
      expect(out.content[0].text).toMatch(/STATE_NOT_FETCHED/)
    }
    expect(vi.mocked(mockedDispatchTool)).not.toHaveBeenCalled()
  })

  it("rejects every mutation tool when the target buffer is stale", async () => {
    for (const name of mutations) {
      const c = ctx("stale")
      const out = await dispatchMCPTool(makeCall(name, { buffer_id: 1 }), c)
      expect(out.isError).toBe(true)
      expect(out.content[0].text).toMatch(/STATE_STALE/)
    }
    expect(vi.mocked(mockedDispatchTool)).not.toHaveBeenCalled()
  })

  // create_notebook is exempt from the freshness gate so a fresh console (no
  // notebook open, nothing to protect) can create its first notebook.
  it("allows create_notebook even when freshness is 'unfetched'", async () => {
    const c = ctx("unfetched")
    const out = await dispatchMCPTool(makeCall("create_notebook"), c)
    expect(out.isError).toBe(false)
    expect(vi.mocked(mockedDispatchTool)).toHaveBeenCalledOnce()
  })

  it("STATE_NOT_FETCHED points at get_notebook_state for the target buffer", async () => {
    // Given nothing has been read (e.g. the target is a background notebook
    // that get_workspace_state can never mark fresh)
    const c = ctx("unfetched")
    // When a mutation is attempted
    const out = await dispatchMCPTool(makeCall("add_cell", { buffer_id: 1 }), c)
    // Then the recovery instruction names the read that actually unblocks it
    expect(out.isError).toBe(true)
    expect(out.content[0].text).toMatch(/get_notebook_state/)
  })

  it("create_notebook records the created buffer as fresh so the agent can populate it", async () => {
    // Given a background create whose result carries the new bufferId
    const c = ctx("unfetched")
    vi.mocked(mockedDispatchTool).mockResolvedValueOnce({
      content: JSON.stringify({ bufferId: 7, label: "n7", activated: false }),
    })
    // When the notebook is created
    await dispatchMCPTool(makeCall("create_notebook", { label: "n7" }), c)
    // Then the create → populate flow proceeds without a guaranteed
    // STATE_NOT_FETCHED round-trip
    const out = await dispatchMCPTool(makeCall("add_cell", { buffer_id: 7 }), c)
    expect(out.isError).toBe(false)
  })

  it("forwards mutation tools when the target buffer is fresh", async () => {
    const c = ctx("fresh")
    const out = await dispatchMCPTool(makeCall("add_cell", { buffer_id: 1 }), c)
    expect(out.isError).toBe(false)
    expect(vi.mocked(mockedDispatchTool)).toHaveBeenCalledOnce()
  })

  it("does NOT change the target's freshness on a successful mutation", async () => {
    const c = ctx("fresh")
    await dispatchMCPTool(makeCall("add_cell", { buffer_id: 1 }), c)
    expect(isFresh(c.freshness, 1)).toBe(true)
  })
})

describe("dispatchMCPTool — read tools through dispatchTool", () => {
  const reads = ["list_cells", "get_cell", "get_notebook_state"]

  it("forwards read tools to dispatchTool regardless of freshness", async () => {
    for (const name of reads) {
      vi.mocked(mockedDispatchTool).mockClear()
      const c = ctx("unfetched")
      const out = await dispatchMCPTool(makeCall(name), c)
      expect(out.isError).toBe(false)
      expect(vi.mocked(mockedDispatchTool)).toHaveBeenCalledOnce()
    }
  })

  it("records the buffer as fresh after a full-state read (get_notebook_state)", async () => {
    const c = ctx("unfetched")
    await dispatchMCPTool(makeCall("get_notebook_state", { buffer_id: 1 }), c)
    expect(isFresh(c.freshness, 1)).toBe(true)
  })

  // Partial reads must NOT clear a user-edit "stale" bit: they don't surface a
  // concurrent edit to another cell, so clearing it would let a later
  // apply_notebook_state silently overwrite that unseen edit.
  it("does NOT clear 'stale' after a partial read (get_cell / list_cells)", async () => {
    for (const name of ["get_cell", "list_cells"]) {
      const c = ctx("stale")
      await dispatchMCPTool(makeCall(name, { buffer_id: 1 }), c)
      expect(isFresh(c.freshness, 1)).toBe(false)
    }
  })
})

describe("dispatchMCPTool — buffer-scoped freshness", () => {
  // C2: a fresh read of one buffer must not license a stale write to another.
  it("rejects a mutation targeting a buffer other than the last full read", async () => {
    const c = ctx("fresh") // readBuffer defaults to 1
    const out = await dispatchMCPTool(
      makeCall("apply_notebook_state", { buffer_id: 2, cells: [] }),
      c,
    )
    expect(out.isError).toBe(true)
    expect(out.content[0].text).toMatch(/STATE_NOT_FETCHED/)
    expect(vi.mocked(mockedDispatchTool)).not.toHaveBeenCalled()
  })

  it("allows a mutation targeting the last fully-read buffer", async () => {
    const c = ctx("fresh") // readBuffer = 1
    const out = await dispatchMCPTool(
      makeCall("apply_notebook_state", { buffer_id: 1, cells: [] }),
      c,
    )
    expect(out.isError).toBe(false)
    expect(vi.mocked(mockedDispatchTool)).toHaveBeenCalledOnce()
  })

  // The core WS2 guarantee: background work on X isn't thrashed by user edits
  // elsewhere.
  it("a user edit to another buffer does NOT stale the agent's target", async () => {
    // Given the agent has read buffer 1
    const c = ctx("fresh")
    // When the user edits a DIFFERENT buffer
    emitUserAction({ kind: "user_added_cell", bufferId: 2, cellId: "u1" })
    // Then a mutation on buffer 1 still goes through
    const out = await dispatchMCPTool(makeCall("add_cell", { buffer_id: 1 }), c)
    expect(out.isError).toBe(false)
    expect(vi.mocked(mockedDispatchTool)).toHaveBeenCalledOnce()
  })

  it("a successful get_notebook_state records the buffer it read as fresh", async () => {
    const c = ctx("stale")
    await dispatchMCPTool(makeCall("get_notebook_state", { buffer_id: 7 }), c)
    expect(isFresh(c.freshness, 7)).toBe(true)
  })

  it("rejects a mutation without a numeric buffer_id outright", async () => {
    // Given a fresh context
    const c = ctx("fresh")
    // When a mutation omits buffer_id
    const out = await dispatchMCPTool(makeCall("add_cell"), c)
    // Then it is refused before reaching the executor
    expect(out.isError).toBe(true)
    expect(out.content[0].text).toMatch(/INVALID_BUFFER_ID/)
    expect(vi.mocked(mockedDispatchTool)).not.toHaveBeenCalled()
  })

  it("records the PRE-read baseline: an edit during get_notebook_state keeps the buffer stale", async () => {
    // Given a full-state read that races a user edit
    const c = ctx("unfetched")
    vi.mocked(mockedDispatchTool).mockImplementationOnce(() => {
      emitUserAction({ kind: "user_added_cell", bufferId: 1, cellId: "mid" })
      return Promise.resolve({ content: "{}" })
    })
    // When the agent reads, then mutates
    await dispatchMCPTool(makeCall("get_notebook_state", { buffer_id: 1 }), c)
    const out = await dispatchMCPTool(makeCall("add_cell", { buffer_id: 1 }), c)
    // Then the mid-read edit still blocks the write — the returned snapshot
    // may predate it
    expect(out.isError).toBe(true)
    expect(out.content[0].text).toMatch(/STATE_STALE/)
  })

  // Finding 2: a failed full-state read surfaced no state → must not clear it.
  it("a FAILED get_notebook_state does NOT clear staleness", async () => {
    vi.mocked(mockedDispatchTool).mockResolvedValueOnce({
      content: "boom",
      is_error: true,
    })
    const c = ctx("stale")
    await dispatchMCPTool(makeCall("get_notebook_state", { buffer_id: 1 }), c)
    expect(isFresh(c.freshness, 1)).toBe(false)
  })

  // C1: get_workspace_state with no open notebook surfaces nothing → must not clear.
  it("get_workspace_state with no open notebook does NOT clear staleness", async () => {
    const meta: MetaToolContext = {
      ...minimalMetaCtx(),
      getActiveBufferId: () => null,
    }
    const c = ctx("stale", meta)
    await dispatchMCPTool(makeCall("get_workspace_state"), c)
    expect(isFresh(c.freshness, 1)).toBe(false)
  })
})

describe("dispatchMCPTool — envelope shape", () => {
  it("wraps dispatchTool output in the wire ToolResultPayload shape", async () => {
    vi.mocked(mockedDispatchTool).mockResolvedValueOnce({
      content: '{"x":1}',
      is_error: false,
    })
    const out = await dispatchMCPTool(makeCall("list_cells"), ctx("fresh"))
    expect(out.content).toHaveLength(1)
    expect(out.content[0].type).toBe("text")
    // Tool body always comes first; the since_last_check suffix is appended.
    expect(out.content[0].text).toMatch(/^\{"x":1\}/)
    expect(out.isError).toBe(false)
  })

  it("propagates is_error=true from dispatchTool", async () => {
    vi.mocked(mockedDispatchTool).mockResolvedValueOnce({
      content: "boom",
      is_error: true,
    })
    const out = await dispatchMCPTool(makeCall("list_cells"), ctx("fresh"))
    expect(out.isError).toBe(true)
    // Tool body still leads the payload; the suffix follows.
    expect(out.content[0].text).toMatch(/^boom/)
  })
})

describe("dispatchMCPTool — since_last_check suffix", () => {
  it("appends current active_buffer to non-meta tool results", async () => {
    const out = await dispatchMCPTool(makeCall("list_cells"), ctx("fresh"))
    expect(out.content[0].text).toMatch(/<since_last_check>/)
    expect(out.content[0].text).toMatch(/active_buffer/)
    expect(out.content[0].text).toMatch(/"n1"/)
  })

  it("flags the active_buffer as archived when the active tab is an archived preview", async () => {
    const archivedMeta: MetaToolContext = {
      getActiveBufferId: () => 1,
      getWorkspace: () => ({
        notebooks: [{ buffer_id: 1, label: "n1", archived: true }],
        active: { buffer_id: 1, label: "n1", kind: "notebook", archived: true },
      }),
      getDigest: () => emptyDigest(),
    }
    const out = await dispatchMCPTool(
      makeCall("list_cells"),
      ctx("fresh", archivedMeta),
    )
    expect(out.content[0].text).toMatch(/active_buffer:.*archived: true/)
  })

  it("does NOT append the suffix to get_workspace_state (it owns the digest)", async () => {
    const c = ctx("unfetched")
    const out = await dispatchMCPTool(makeCall("get_workspace_state"), c)
    expect(out.content[0].text).not.toMatch(/<since_last_check>/)
  })

  it("does NOT append the suffix to get_recent_user_actions", async () => {
    const c = ctx("stale")
    const out = await dispatchMCPTool(makeCall("get_recent_user_actions"), c)
    expect(out.content[0].text).not.toMatch(/<since_last_check>/)
  })

  it("includes user events in the suffix when the digest has any", async () => {
    const digestWithEdits = (): UserActionDigest => ({
      added: new Set<string>(["c-1"]),
      deleted: new Set<string>(),
      edited: new Set<string>(["c-2"]),
      ran: new Map<string, "success" | "error">(),
    })
    const meta: MetaToolContext = {
      ...minimalMetaCtx(),
      getDigest: () => digestWithEdits(),
      consumeDigest: () => digestWithEdits(),
    }
    const out = await dispatchMCPTool(
      makeCall("list_cells"),
      ctx("fresh", meta),
    )
    expect(out.content[0].text).toMatch(/added: \[c-1\]/)
    expect(out.content[0].text).toMatch(/edited: \[c-2\]/)
  })

  it("calls consumeDigest exactly once per non-meta dispatch", async () => {
    const consume = vi.fn(emptyDigest)
    const meta: MetaToolContext = {
      ...minimalMetaCtx(),
      consumeDigest: consume,
    }
    await dispatchMCPTool(makeCall("list_cells"), ctx("fresh", meta))
    expect(consume).toHaveBeenCalledOnce()
  })
})
