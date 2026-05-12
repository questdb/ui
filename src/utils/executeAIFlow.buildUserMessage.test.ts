import { describe, it, expect } from "vitest"
import { buildUserMessage } from "./executeAIFlow"
import type { NotebookContextSnapshot } from "./ai/notebookSnapshot"
import { createEmptyDigest } from "../providers/AIConversationProvider/userActionDigest"

const baseChatConfig = {
  conversationId: "conv-1",
  settings: { model: "m", apiKey: "k" },
  questClient: {} as never,
  hasSchemaAccess: false,
} as const

const okSnapshot: NotebookContextSnapshot = {
  status: "ok",
  buffer_id: 42,
  label: "Trades",
  layout_mode: "list",
  maximized_cell_id: null,
  cells: [],
}

describe("buildUserMessage — notebook prefix injection", () => {
  it("omits the prefix entirely when notebookContext is absent", () => {
    const out = buildUserMessage({
      ...baseChatConfig,
      type: "chat",
      userMessage: "hi",
      conversationHistory: [],
      isFirstMessage: false,
    })
    expect(out.content).toBe("hi")
    expect(out.content).not.toContain("<notebook_context>")
  })

  it("prepends snapshot block when notebookContext.snapshot is ok", () => {
    const out = buildUserMessage({
      ...baseChatConfig,
      type: "chat",
      userMessage: "add a cell",
      conversationHistory: [],
      isFirstMessage: false,
      notebookContext: { snapshot: okSnapshot },
    })
    expect(out.content.startsWith("<notebook_context>")).toBe(true)
    expect(out.content).toContain("buffer_id: 42")
    expect(out.content).toContain("add a cell")
  })

  it("prepends warning block for archived snapshot", () => {
    const out = buildUserMessage({
      ...baseChatConfig,
      type: "chat",
      userMessage: "please continue",
      conversationHistory: [],
      isFirstMessage: false,
      notebookContext: {
        snapshot: { status: "archived", buffer_id: 7, label: "Old" },
      },
    })
    expect(out.content).toContain("status: archived")
    expect(out.content).toContain("create_notebook")
  })

  it("combines snapshot + user-events digest with a single blank line gap", () => {
    const digest = createEmptyDigest()
    digest.added.add("a1")
    digest.ran.set("a1", "error")
    const out = buildUserMessage({
      ...baseChatConfig,
      type: "chat",
      userMessage: "fix it",
      conversationHistory: [],
      isFirstMessage: false,
      notebookContext: { snapshot: okSnapshot, digest },
    })
    expect(out.content).toContain("<notebook_context>")
    expect(out.content).toContain("<user_events")
    expect(out.content).toContain("added: [a1]")
    expect(out.content).toContain("ran: { a1: error }")
    expect(out.content.trimEnd().endsWith("fix it")).toBe(true)
  })

  it("applies the prefix to explain/fix/schema_explain/health_issue flows too", () => {
    const explain = buildUserMessage({
      ...baseChatConfig,
      type: "explain",
      queryText: "SELECT 1",
      notebookContext: { snapshot: okSnapshot },
    })
    expect(explain.content).toContain("<notebook_context>")
    expect(explain.content).toContain("SELECT 1")

    const fix = buildUserMessage({
      ...baseChatConfig,
      type: "fix",
      queryText: "SELECT broken",
      errorMessage: "syntax",
      notebookContext: { snapshot: okSnapshot },
    })
    expect(fix.content).toContain("<notebook_context>")
    expect(fix.content).toContain("SELECT broken")
  })

  it("empty digest + null snapshot + no workspace → no prefix", () => {
    const out = buildUserMessage({
      ...baseChatConfig,
      type: "chat",
      userMessage: "hey",
      conversationHistory: [],
      isFirstMessage: false,
      notebookContext: { snapshot: null, digest: createEmptyDigest() },
    })
    expect(out.content).toBe("hey")
  })

  it("injects <workspace> alone for unbound chats with notebook tabs", () => {
    const out = buildUserMessage({
      ...baseChatConfig,
      type: "chat",
      userMessage: "go to Notebook 1 and add a cell",
      conversationHistory: [],
      isFirstMessage: false,
      notebookContext: {
        snapshot: null,
        workspace: {
          notebooks: [
            { buffer_id: 2, label: "Notebook 1", archived: false },
            { buffer_id: 7, label: "Archived one", archived: true },
          ],
          active: { buffer_id: 3, label: "Query 1", kind: "sql" },
        },
      },
    })
    expect(out.content).toContain("<workspace>")
    // Unbound chats learn notebook labels via <workspace> without <notebook_context>.
    expect(out.content).not.toContain("<notebook_context>")
    expect(out.content).toContain('label: "Notebook 1"')
    expect(out.content).toContain("go to Notebook 1")
  })
})
