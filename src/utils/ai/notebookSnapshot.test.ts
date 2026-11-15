import "../../test/stubBrowserGlobals"
import { describe, it, expect, beforeEach } from "vitest"

import {
  formatDigest,
  formatNotebookContextPrefix,
  formatSnapshot,
  summarizeCells,
  type NotebookContextSnapshot,
} from "./notebookSnapshot"
import { __resetNotebookAIBridgeForTests } from "../notebooks/notebookAIBridge"
import { __resetNotebookControllerForTests } from "../notebooks/notebookController"
import { __resetNotebookBufferQueuesForTests } from "../notebooks/notebookBufferQueue"
import { db } from "../../store/db"
import type { NotebookCell } from "../../store/notebook"
import { createEmptyDigest } from "../../providers/AIConversationProvider/userActionDigest"

const sql = (
  id: string,
  value = "",
  overrides: Partial<NotebookCell> = {},
): NotebookCell => ({
  id,
  position: 0,
  value,
  ...overrides,
})

beforeEach(async () => {
  __resetNotebookControllerForTests()
  __resetNotebookAIBridgeForTests()
  __resetNotebookBufferQueuesForTests()
  await db.buffers.clear()
  await db.notebook_results.clear()
})

describe("summarizeCells", () => {
  it("includes the cell name when the cell has one", () => {
    // Given a named cell and an unnamed one
    const cells = [
      sql("a", "select 1", { name: "Recent Trades" }),
      sql("b", "select 2"),
    ]

    // When summarizing for list_cells
    const [named, unnamed] = summarizeCells(
      cells,
      undefined,
      () => "unrequested",
    )

    // Then the name is surfaced for the named cell and omitted otherwise
    expect(named.name).toBe("Recent Trades")
    expect(unnamed.name).toBeUndefined()
    expect(named.mode).toBeNull()
    expect(unnamed.mode).toBeNull()
  })

  it("derives run mode only while a table snapshot still exists", () => {
    // Given a cell that ran before with no explicit mode
    const released = sql("a", "SELECT 1", {
      lastRunStatus: "success",
      paneView: "result",
    })

    // When it is summarized with a missing snapshot and with an unrequested one
    const missingMode = summarizeCells(
      [released],
      undefined,
      () => "missing",
    )[0].mode
    const unrequestedMode = summarizeCells(
      [released],
      undefined,
      () => "unrequested",
    )[0].mode

    // Then run mode is derived only while the snapshot may still exist
    expect(missingMode).toBe(null)
    expect(unrequestedMode).toBe("run")
  })
})

describe("formatSnapshot", () => {
  it("emits a warning-variant block for archived status", () => {
    const snap: NotebookContextSnapshot = {
      status: "archived",
      buffer_id: 7,
      label: "Trades",
    }
    const out = formatSnapshot(snap)
    expect(out).toContain("status: archived")
    expect(out).toContain("buffer_id: 7")
    expect(out).toContain("Trades")
    expect(out).toContain("create_notebook")
  })

  it("emits a warning block for deleted status without label", () => {
    const out = formatSnapshot({ status: "deleted", buffer_id: 9 })
    expect(out).toContain("status: deleted")
    expect(out).not.toMatch(/label:/)
  })
})

describe("formatDigest", () => {
  it("returns empty string for an empty digest", () => {
    expect(formatDigest(createEmptyDigest())).toBe("")
  })

  it("emits a block listing added/deleted/edited/ran/layout/status", () => {
    const d = createEmptyDigest()
    d.added.add("a1")
    d.deleted.add("d1")
    d.edited.add("e1")
    d.ran.set("r1", "error")
    d.layoutModeTo = "grid"
    d.tabChanges.push({
      bufferId: 7,
      kind: "notebook",
      label: "Old",
      status: "closed",
    })
    const out = formatDigest(d)
    expect(out).toContain("added: [a1]")
    expect(out).toContain("deleted: [d1]")
    expect(out).toContain("edited: [e1]")
    expect(out).toContain("ran: { r1: error }")
    expect(out).toContain("layout_mode: grid")
    expect(out).toContain(
      'tabs_closed: [{ buffer_id: 7, label: "Old", kind: notebook }]',
    )
  })

  it("prints an Off autorefresh default — false is a value, not an absence", () => {
    // Given a digest whose only change is the notebook default going Off
    const d = createEmptyDigest()
    d.autoRefreshDefaultTo = false
    // Then the block states it (a truthiness guard would drop this line)
    expect(formatDigest(d)).toContain("auto_refresh_default: false")
  })
})

describe("formatNotebookContextPrefix", () => {
  it("returns empty string when all inputs are empty", () => {
    expect(formatNotebookContextPrefix(null, undefined)).toBe("")
    expect(formatNotebookContextPrefix(null, createEmptyDigest())).toBe("")
  })

  it("combines snapshot + digest blocks with trailing newline", () => {
    const snap: NotebookContextSnapshot = {
      status: "ok",
      buffer_id: 1,
      label: "x",
      layout_mode: "list",
      auto_refresh_default: true,
      maximized_cell_id: null,
      cells: [],
    }
    const digest = createEmptyDigest()
    digest.added.add("a")
    const prefix = formatNotebookContextPrefix(snap, digest)
    expect(prefix.endsWith("\n\n")).toBe(true)
    expect(prefix).toContain("<notebook_context>")
    expect(prefix).toContain("<user_events")
  })

  it("emits <workspace> first, then <notebook_context>, then <user_events>", () => {
    const snap: NotebookContextSnapshot = {
      status: "ok",
      buffer_id: 2,
      label: "Notebook 1",
      layout_mode: "list",
      auto_refresh_default: true,
      maximized_cell_id: null,
      cells: [],
    }
    const digest = createEmptyDigest()
    digest.added.add("a")
    const prefix = formatNotebookContextPrefix(snap, digest, {
      tabs: [
        {
          buffer_id: 2,
          label: "Notebook 1",
          kind: "notebook",
          archived: false,
          bound_to_this_chat: true,
        },
      ],
      active: { buffer_id: 2, label: "Notebook 1", kind: "notebook" },
    })
    const wsIdx = prefix.indexOf("<workspace>")
    const ctxIdx = prefix.indexOf("<notebook_context>")
    const evtIdx = prefix.indexOf("<user_events")
    expect(wsIdx).toBeGreaterThan(-1)
    expect(ctxIdx).toBeGreaterThan(wsIdx)
    expect(evtIdx).toBeGreaterThan(ctxIdx)
  })

  it("emits <workspace> alone for unbound chats with notebook tabs", () => {
    const prefix = formatNotebookContextPrefix(null, undefined, {
      tabs: [
        { buffer_id: 5, label: "Sales", kind: "notebook", archived: false },
        { buffer_id: 9, label: "Old", kind: "notebook", archived: true },
      ],
      active: { buffer_id: 5, label: "Sales", kind: "notebook" },
    })
    expect(prefix).toContain("<workspace>")
    expect(prefix).not.toContain("<notebook_context>")
    expect(prefix).not.toContain("<user_events")
    expect(prefix).toContain('label: "Sales"')
    expect(prefix).toContain("archived: true")
    expect(prefix).toContain("kind: notebook")
  })

  it("workspace block quotes labels and exposes buffer_id / kind", () => {
    const prefix = formatNotebookContextPrefix(null, undefined, {
      tabs: [
        { buffer_id: 42, label: "Trades", kind: "notebook", archived: false },
      ],
      active: { buffer_id: 3, label: "Query 1", kind: "sql" },
    })
    expect(prefix).toContain(
      'active: { buffer_id: 3, label: "Query 1", kind: sql }',
    )
    expect(prefix).toContain("buffer_id: 42")
    expect(prefix).toContain('label: "Trades"')
  })

  it("flags the active buffer as archived when previewing an archived notebook", () => {
    const prefix = formatNotebookContextPrefix(null, undefined, {
      tabs: [{ buffer_id: 7, label: "Old", kind: "notebook", archived: true }],
      active: { buffer_id: 7, label: "Old", kind: "notebook", archived: true },
    })
    expect(prefix).toContain(
      'active: { buffer_id: 7, label: "Old", kind: notebook, archived: true }',
    )
  })
})
