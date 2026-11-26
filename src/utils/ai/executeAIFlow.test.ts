import { describe, expect, it } from "vitest"
import {
  USER_MESSAGE_DISPLAY_TYPES,
  type ConversationMessage,
} from "../../providers/AIConversationProvider/types"
import { createEmptyDigest } from "../../providers/AIConversationProvider/userActionDigest"
import { priorConversationFor } from "../localAgent/priorConversation"
import {
  buildUserMessage,
  createChatFlowConfig,
  createExplainFlowConfig,
  createFixFlowConfig,
  createHealthIssueFlowConfig,
  createSchemaExplainFlowConfig,
  type AIFlowConfig,
} from "./executeAIFlow"
import type { NotebookContextSnapshot } from "./notebookSnapshot"

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
  auto_refresh_default: true,
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

const handOver = (...turns: string[]) =>
  [
    "<earlier_conversation>",
    "The user talked to another assistant in this chat before switching to you. Earlier messages, oldest first:",
    ...turns,
    "</earlier_conversation>",
  ].join("\n")

// Every flow prepends the notebook the chat works on, which the chat never
// shows.
const flowBase = {
  ...baseChatConfig,
  hasSchemaAccess: true,
  notebookContext: { snapshot: { ...okSnapshot, label: "Hidden notebook" } },
}

type RequestCase = {
  name: string
  config: AIFlowConfig
  // What the chat showed of the request.
  shown: string
  // Parts of the request's prompt that the chat never showed.
  hidden: string[]
}

// Every flow that writes a user message, with what its prompt holds beyond
// what the chat shows.
const requests: Record<AIFlowConfig["type"], RequestCase[]> = {
  chat: [
    {
      name: "a chat message",
      config: createChatFlowConfig({
        ...flowBase,
        userMessage: "Chart trades by hour",
        conversationHistory: [],
        isFirstMessage: false,
      }),
      shown: "Chart trades by hour",
      hidden: ["Hidden notebook"],
    },
    {
      name: "a first chat message about the editor's query",
      config: createChatFlowConfig({
        ...flowBase,
        userMessage: "Why is this slow?",
        currentSQL: "SELECT * FROM trades",
        conversationHistory: [],
        isFirstMessage: true,
      }),
      shown: "Why is this slow?\nAttached SQL:\nSELECT * FROM trades",
      hidden: ["Hidden notebook", "User request:"],
    },
  ],
  explain: [
    {
      name: "Explain query",
      config: createExplainFlowConfig({
        ...flowBase,
        queryText: "SELECT avg(price) FROM trades",
      }),
      shown:
        "Explain this query in detail.\nAttached SQL:\nSELECT avg(price) FROM trades",
      hidden: ["Hidden notebook", "Using your tools"],
    },
  ],
  fix: [
    {
      name: "Fix query with its error",
      config: createFixFlowConfig({
        ...flowBase,
        queryText: "SELEC 1",
        errorMessage: "unexpected token [SELEC]",
        errorWord: "SELEC",
      }),
      shown:
        "Help me debug and fix the error with the attached SQL query.\nAttached SQL:\nSELEC 1",
      hidden: ["Hidden notebook", "unexpected token [SELEC]"],
    },
    {
      name: "Fix query without its error",
      config: createFixFlowConfig({ ...flowBase, queryText: "SELEC 1" }),
      shown:
        "Help me debug and fix the error with the attached SQL query.\nAttached SQL:\nSELEC 1",
      hidden: ["Hidden notebook", "validate_query"],
    },
  ],
  schema_explain: [
    {
      name: "Explain schema of a table",
      config: createSchemaExplainFlowConfig({
        ...flowBase,
        tableName: "trades",
        schema:
          "CREATE TABLE trades (secret_margin DOUBLE, ts TIMESTAMP) timestamp(ts) PARTITION BY DAY WAL;",
        kindLabel: "Table",
        schemaDisplayData: { tableName: "trades", kind: "table" },
      }),
      shown:
        "Explain the schema of table trades: an overview, detailed column descriptions and storage details.",
      hidden: ["Hidden notebook", "secret_margin", "You are a SQL expert"],
    },
    {
      name: "Explain schema of a materialized view",
      config: createSchemaExplainFlowConfig({
        ...flowBase,
        tableName: "trades_1h",
        schema:
          "CREATE MATERIALIZED VIEW trades_1h AS (SELECT ts, sum(secret_margin) FROM trades SAMPLE BY 1h);",
        kindLabel: "Materialized view",
        schemaDisplayData: { tableName: "trades_1h", kind: "matview" },
      }),
      shown:
        "Explain the schema of materialized view trades_1h: an overview, detailed column descriptions and storage details.",
      hidden: ["Hidden notebook", "secret_margin", "You are a SQL expert"],
    },
  ],
  health_issue: [
    {
      name: "Ask AI about a health issue",
      config: createHealthIssueFlowConfig({
        ...flowBase,
        tableName: "trades",
        issue: {
          id: "R1",
          field: "table_suspended",
          message: "WAL is suspended",
          currentValue: "secret current value",
          severity: "critical",
        },
        tableDetails: JSON.stringify({
          table_name: "trades",
          table_row_count: "123456789",
        }),
        diagnosticDetails: {
          source: "materialized_views()",
          data: JSON.stringify({ view_status: "secret status" }),
        },
        issueGuidance: "Secret guidance",
        monitoringDocs: "Secret docs",
        trendSamples: [{ value: BigInt(987654321), timestamp: 0 }],
      }),
      shown:
        "Analyze the critical health issue of table trades and provide steps for resolution: WAL is suspended",
      hidden: [
        "Hidden notebook",
        "secret current value",
        "123456789",
        "secret status",
        "Secret guidance",
        "Secret docs",
        "987654321",
        "Your Task",
      ],
    },
  ],
}

describe("buildUserMessage — what an agent taking the chat over reads", () => {
  const cases = Object.values(requests).flat()

  it.each(USER_MESSAGE_DISPLAY_TYPES)(
    "has a request that writes a %s",
    (displayType) => {
      // Given every flow that writes a user message
      // When each builds its message
      const writers = cases.filter(
        ({ config }) => buildUserMessage(config).displayType === displayType,
      )

      // Then one of them writes this display type
      expect(writers.map(({ name }) => name)).not.toEqual([])
    },
  )

  it.each(cases)(
    "hands over $name without the prompt the chat never showed",
    ({ config, shown, hidden }) => {
      // Given the request, stored as the chat stores it, and an API model's
      // answer
      const request: ConversationMessage = {
        id: "request",
        timestamp: 0,
        role: "user",
        ...buildUserMessage(config),
      }
      const history: ConversationMessage[] = [
        request,
        { id: "answer", timestamp: 1, role: "assistant", content: "Answered." },
      ]

      // When an agent takes the chat over
      const prior = priorConversationFor(history, "agent-session")

      // Then it reads what the chat showed, and none of the prompt
      expect(prior).toBe(handOver(`User: ${shown}`, "Assistant: Answered."))
      for (const text of hidden) {
        expect(request.content).toContain(text)
        expect(prior).not.toContain(text)
      }
    },
  )
})
