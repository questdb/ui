import "../../test/stubBrowserGlobals"
import { beforeEach, describe, expect, it } from "vitest"

import {
  resolveGetRecentUserActions,
  resolveGetWorkspaceState,
  type MetaToolContext,
} from "./metaResolvers"
import type { UserActionDigest } from "../../providers/AIConversationProvider/types"
import { __resetNotebookAIBridgeForTests } from "../notebooks/notebookAIBridge"
import { __resetNotebookBufferQueuesForTests } from "../notebooks/notebookBufferQueue"
import { db } from "../../store/db"

const seedNotebookBuffer = (id: number) =>
  db.buffers.put({
    id,
    label: `n${id}`,
    value: "",
    position: 0,
    notebookViewState: { cells: [], settings: { layoutMode: "list" } },
  })

const emptyDigest = (): UserActionDigest => ({
  added: new Set(),
  deleted: new Set(),
  edited: new Set(),
  ran: new Map(),
  tabChanges: [],
})

beforeEach(async () => {
  __resetNotebookAIBridgeForTests()
  __resetNotebookBufferQueuesForTests()
  await db.buffers.clear()
})

describe("resolveGetWorkspaceState", () => {
  it("returns no_notebook_open status when no active buffer", async () => {
    const ctx: MetaToolContext = {
      getActiveBufferId: () => null,
      getWorkspace: () => null,
      getDigest: () => null,
    }
    const out = await resolveGetWorkspaceState(undefined, ctx)
    expect(out).toHaveLength(1)
    expect(out[0].text).toMatch(/no_notebook_open/)
    expect(out[0].text).toMatch(/create_notebook/)
  })

  it("lists openable notebooks when active tab is not a notebook", async () => {
    // Given the active tab is a SQL buffer but notebooks exist in the workspace
    const ctx: MetaToolContext = {
      getActiveBufferId: () => null,
      getWorkspace: () => ({
        tabs: [
          { buffer_id: 2, label: "Trades", kind: "notebook", archived: false },
          { buffer_id: 5, label: "Latency", kind: "notebook", archived: false },
        ],
        active: { buffer_id: 9, label: "Query 1", kind: "sql" },
      }),
      getDigest: () => null,
    }

    // When workspace state is resolved
    const out = await resolveGetWorkspaceState(undefined, ctx)

    // Then it surfaces the openable notebooks and how to target them by buffer_id
    expect(out[0].text).toMatch(/no_notebook_open/)
    expect(out[0].text).toContain("<workspace>")
    expect(out[0].text).toContain("Trades")
    expect(out[0].text).toContain("Latency")
    expect(out[0].text).toMatch(/buffer_id/)
  })

  it("lists SQL and metrics tabs when the workspace has no notebook", async () => {
    // Given only SQL and metrics tabs, one of them closed
    const ctx: MetaToolContext = {
      getActiveBufferId: () => null,
      getWorkspace: () => ({
        tabs: [
          { buffer_id: 11, label: "Query A", kind: "sql", archived: false },
          { buffer_id: 12, label: "Latency", kind: "metrics", archived: false },
          { buffer_id: 13, label: "Old query", kind: "sql", archived: true },
        ],
        active: { buffer_id: 11, label: "Query A", kind: "sql" },
      }),
      getDigest: () => null,
    }

    // When workspace state is resolved
    const out = await resolveGetWorkspaceState(undefined, ctx)

    // Then every tab is listed, so the tab tools can target it by buffer_id
    expect(out[0].text).toMatch(/no_notebook_open/)
    expect(out[0].text).toContain("<workspace>")
    expect(out[0].text).toContain("buffer_id: 11")
    expect(out[0].text).toContain("buffer_id: 12")
    expect(out[0].text).toContain("buffer_id: 13")
  })

  it("returns workspace + notebook_context when buffer is active", async () => {
    await seedNotebookBuffer(1)
    const ctx: MetaToolContext = {
      getActiveBufferId: () => 1,
      getWorkspace: () => ({
        tabs: [
          { buffer_id: 1, label: "n1", kind: "notebook", archived: false },
        ],
        active: { buffer_id: 1, label: "n1", kind: "notebook" },
      }),
      getDigest: () => null,
    }
    const out = await resolveGetWorkspaceState(undefined, ctx)
    expect(out[0].text).toContain("<workspace>")
    expect(out[0].text).toContain("<notebook_context>")
  })

  it("appends user_events block when include_user_events is true", async () => {
    await seedNotebookBuffer(1)
    const digest = emptyDigest()
    digest.added.add("cell-1")
    const ctx: MetaToolContext = {
      getActiveBufferId: () => 1,
      getWorkspace: () => ({
        tabs: [
          { buffer_id: 1, label: "n1", kind: "notebook", archived: false },
        ],
        active: { buffer_id: 1, label: "n1", kind: "notebook" },
      }),
      getDigest: () => digest,
    }
    const out = await resolveGetWorkspaceState(
      { include_user_events: true },
      ctx,
    )
    expect(out[0].text).toContain("<user_events")
    expect(out[0].text).toContain("cell-1")
  })

  it("omits user_events block when include_user_events is false / unset", async () => {
    await seedNotebookBuffer(1)
    const ctx: MetaToolContext = {
      getActiveBufferId: () => 1,
      getWorkspace: () => null,
      getDigest: () => emptyDigest(),
    }
    const out = await resolveGetWorkspaceState(undefined, ctx)
    expect(out[0].text).not.toContain("<user_events")
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
