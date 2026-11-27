import "../../test/stubBrowserGlobals"
import type { Permissions } from "../tools/permissions"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { dispatchMCPTool, type DispatchContext } from "./dispatchMCPTool"
import { createNotebookFreshness } from "../notebooks/notebookFreshness"
import { db } from "../../store/db"
import { EXPECTED_MCP_VERSION } from "./protocolVersion"
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
  v: EXPECTED_MCP_VERSION,
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

const ALL_GRANTED: Permissions = {
  grantSchemaAccess: true,
  read: true,
  write: true,
}

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
    permissions: { get: () => ALL_GRANTED, consumeDirty: () => false },
    validateSql: () =>
      Promise.resolve({ query: "", columns: [], timestamp: 0 }),
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

describe("dispatchMCPTool — suggest_query", () => {
  // The real suggest_query of the AI Assistant's dispatcher.
  const useRealDispatchOnce = async () => {
    const actual =
      await vi.importActual<typeof import("../tools/dispatch")>(
        "../tools/dispatch",
      )
    vi.mocked(mockedDispatchTool).mockImplementationOnce(actual.dispatchTool)
  }

  it("shows the query in the chat answer of the call's turn, and tells the agent", async () => {
    // Given a call of a chat agent's running turn
    await useRealDispatchOnce()
    const onSuggestedQuery = vi.fn()

    // When the agent suggests a query
    const out = await dispatchMCPTool(
      makeCall("suggest_query", { query: "SELECT 1" }),
      { ...ctx("fresh"), onSuggestedQuery },
    )

    // Then the answer takes it, and the agent learns that it shows
    expect(onSuggestedQuery.mock.calls).toEqual([["SELECT 1"]])
    expect(out.isError).toBe(false)
    expect(out.content[0].text).toMatch(
      /^Query suggestion registered\. It will be shown to the user as a suggestion they can accept or reject\./,
    )
  })

  it("tells the agent that nothing was shown when no chat answer takes it", async () => {
    // Given a call that no running chat answer takes: from the terminal, or
    // after its turn ended

    // When the agent suggests a query
    const out = await dispatchMCPTool(
      makeCall("suggest_query", { query: "SELECT 1" }),
      ctx("fresh"),
    )

    // Then the agent learns that the user saw nothing
    expect(out.isError).toBe(true)
    expect(out.content[0].text).toMatch(
      /^suggest_query works only during an AI Assistant chat answer; nothing was shown to the user\./,
    )
    expect(mockedDispatchTool).not.toHaveBeenCalled()
  })

  it("shows nothing for a call without a query", async () => {
    // Given a call of a chat agent's running turn
    await useRealDispatchOnce()
    const onSuggestedQuery = vi.fn()

    // When the agent leaves out the query
    const out = await dispatchMCPTool(makeCall("suggest_query", {}), {
      ...ctx("fresh"),
      onSuggestedQuery,
    })

    // Then the answer takes nothing, and the agent learns why
    expect(onSuggestedQuery).not.toHaveBeenCalled()
    expect(out.isError).toBe(true)
    expect(out.content[0].text).toMatch(/^Error: query parameter is required/)
  })
})
