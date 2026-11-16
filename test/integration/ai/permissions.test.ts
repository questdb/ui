import "../../../src/test/stubBrowserGlobals"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  executeAIFlow,
  type AIFlowCallbacks,
} from "../../../src/utils/ai/executeAIFlow"
import { hasSchemaAccess } from "../../../src/utils/ai/settings"
import { clearStatementClassCache } from "../../../src/utils/tools/permissions"
import { Client } from "../../../src/utils/questdb/client"
import type { Table } from "../../../src/utils/questdb/types"
import type { AiAssistantSettings } from "../../../src/providers/LocalStorageProvider/types"
import type { ConversationMessage } from "../../../src/providers/AIConversationProvider/types"

const tableName = "permission_trades"
const ddl = `CREATE TABLE ${tableName} (price DOUBLE);`
const selectSQL = `SELECT price FROM ${tableName}`
const dropSQL = `DROP TABLE ${tableName}`
const insertSQL = `INSERT INTO ${tableName} VALUES (42)`
const schemaSQL = `SHOW CREATE TABLE '${tableName}';`
const detailsSQL = `tables() where table_name = '${tableName}';`
const details = { table_name: tableName, walEnabled: false }
const explanation = "Permission probe complete."
const callId = "call_permission_probe"
const levels = [
  { name: "None", grantSchemaAccess: false, read: false, write: false },
  { name: "Schema", grantSchemaAccess: true, read: false, write: false },
  { name: "Read", grantSchemaAccess: true, read: true, write: false },
  { name: "Write", grantSchemaAccess: true, read: true, write: true },
]
const probes = [
  { name: "validate_query", args: { query: "SELECT 1" }, scope: "free" },
  { name: "suggest_query", args: { query: "SELECT 1" }, scope: "free" },
  { name: "get_questdb_toc", args: {}, scope: "free" },
  { name: "get_tables", args: {}, scope: "schema" },
  {
    name: "get_table_schema",
    args: { table_name: tableName },
    scope: "schema",
  },
  {
    name: "get_table_details",
    args: { table_name: tableName },
    scope: "schema",
  },
  { name: "run_query", args: { sql: selectSQL }, scope: "read" },
  { name: "run_query", args: { sql: dropSQL }, scope: "ddl" },
  { name: "run_query", args: { sql: insertSQL }, scope: "dml" },
] as const

type ProviderRequest = {
  input: Array<{ type?: string; call_id?: string; output?: string }>
  tools: Array<{ name: string }>
}

const streamResponse = (output: unknown[], text = "") => {
  const events = text
    ? [{ type: "response.output_text.delta", delta: text }]
    : []
  return new Response(
    [
      ...events,
      {
        type: "response.completed",
        response: {
          id: "resp_permission",
          object: "response",
          status: "completed",
          output,
          output_text: text,
        },
      },
    ]
      .map(
        (event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
      )
      .join("") + "data: [DONE]\n\n",
    { headers: { "Content-Type": "text/event-stream" } },
  )
}

const dqlResponse = (
  columns: Array<{ name: string; type: string }>,
  dataset: unknown[][],
) => Response.json({ columns, dataset, count: dataset.length })

let probeTime = Date.now()
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime((probeTime += 3000))
  clearStatementClassCache()
  localStorage.clear()
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    setTimeout(() => callback(0), 0),
  )
  vi.stubGlobal("cancelAnimationFrame", clearTimeout)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe.each(levels)("AI permission flow: $name", (level) => {
  it.each(probes)("enforces $scope access for $name", async (probe) => {
    // Given saved permissions and a provider that requests one tool, even when it is not advertised
    const settings: AiAssistantSettings = {
      modelValueFormat: 2,
      selectedModel: "openai:gpt-5-mini",
      providers: {
        openai: {
          apiKey: "test-key",
          enabledModels: ["openai:gpt-5-mini"],
          ...level,
        },
      },
    }
    localStorage.setItem("ai.assistant.settings", JSON.stringify(settings))
    const requests: ProviderRequest[] = []
    const executedSQL: string[] = []
    const validatedSQL: string[] = []
    const unexpectedHTTP: string[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(
          typeof input === "string"
            ? input.trim()
            : input instanceof URL
              ? input.href
              : input.url,
          "http://localhost/",
        )
        if (url.href === "https://api.openai.com/v1/responses") {
          const request = new Request(
            input instanceof Request ? input : url,
            init,
          )
          requests.push((await request.json()) as ProviderRequest)
          if (requests.length === 1)
            return streamResponse([
              {
                type: "function_call",
                id: "fc_permission",
                call_id: callId,
                name: probe.name,
                arguments: JSON.stringify(probe.args),
              },
            ])
          if (requests.length === 2)
            return streamResponse(
              [
                {
                  type: "message",
                  id: "msg_permission",
                  role: "assistant",
                  status: "completed",
                  content: [
                    { type: "output_text", text: explanation, annotations: [] },
                  ],
                },
              ],
              explanation,
            )
        }
        const sql = url.searchParams.get("query") ?? ""
        if (url.pathname === "/api/v1/sql/validate") {
          validatedSQL.push(sql)
          return Response.json(
            sql.startsWith("DROP")
              ? { queryType: "DROP TABLE" }
              : sql.startsWith("INSERT")
                ? { queryType: "INSERT" }
                : { columns: [{ name: "price", type: "DOUBLE" }] },
          )
        }
        if (url.pathname === "/exec") {
          executedSQL.push(sql)
          if (sql === schemaSQL)
            return dqlResponse([{ name: "ddl", type: "STRING" }], [[ddl]])
          if (sql === detailsSQL)
            return dqlResponse(
              [
                { name: "table_name", type: "STRING" },
                { name: "walEnabled", type: "BOOLEAN" },
              ],
              [[tableName, false]],
            )
          if (sql === selectSQL)
            return dqlResponse(
              [{ name: "price", type: "DOUBLE" }],
              [[42], [73]],
            )
          if (sql === dropSQL) return Response.json({ ddl: "OK" })
          if (sql === insertSQL) return Response.json({ dml: "OK" })
        }
        if (url.pathname === "/docs/web-console/toc-list.json")
          return Response.json({
            functions: ["count()"],
            operators: ["="],
            sql: ["SELECT"],
          })
        unexpectedHTTP.push(url.href)
        throw new Error(`Unexpected HTTP: ${url.href}`)
      }),
    )
    const messages: ConversationMessage[] = []
    const callbacks: AIFlowCallbacks = {
      addMessage: (message) =>
        messages.push({ id: crypto.randomUUID(), ...message }),
      updateMessage: (_conversationId, messageId, update) =>
        Object.assign(
          messages.find((message) => message.id === messageId)!,
          update,
        ),
      setStatus: vi.fn(),
      setIsStreaming: vi.fn(),
      persistMessages: vi.fn(async () => {}),
    }

    // When the real flow parses the provider stream, dispatches the tool, and sends its result back
    const result = await executeAIFlow(
      {
        type: "chat",
        conversationId: "permissions",
        userMessage: "Probe the permission boundary.",
        conversationHistory: [],
        isFirstMessage: false,
        settings: { model: settings.selectedModel!, apiKey: "test-key" },
        aiAssistantSettings: settings,
        hasSchemaAccess: hasSchemaAccess(settings),
        questClient: new Client(),
        tables: [details as Table],
      },
      callbacks,
    )

    // Then the exact call receives a result and the completed answer reaches the conversation
    expect(unexpectedHTTP).toEqual([])
    expect(result.success).toBe(true)
    expect(requests).toHaveLength(2)
    if (!level.grantSchemaAccess) {
      expect(JSON.stringify(requests[0].input)).not.toContain(tableName)
    }
    const output = requests[1].input.find(
      (item) => item.type === "function_call_output" && item.call_id === callId,
    )?.output
    expect(output).toBeDefined()
    expect(messages.filter((message) => message.role === "tool")).toEqual([
      expect.objectContaining({
        tool_call_id: callId,
        name: probe.name,
        content: output,
      }),
    ])
    expect(
      messages.filter(
        (message) =>
          message.role === "assistant" && message.content === explanation,
      ),
    ).toHaveLength(1)
    expect(callbacks.persistMessages).toHaveBeenCalledOnce()
    expect(callbacks.setIsStreaming).toHaveBeenLastCalledWith(false)

    const granted =
      probe.scope === "free" ||
      (probe.scope === "schema"
        ? level.grantSchemaAccess
        : probe.scope === "read"
          ? level.read
          : level.write)
    if (!granted) {
      const suffix =
        "Ask the user to grant it in the QuestDB console (footer → MCP popover or AI Assistant settings)."
      const denied =
        probe.scope === "schema"
          ? `PERMISSION_DENIED: tool '${probe.name}' requires the 'grantSchemaAccess' permission. ${suffix}`
          : probe.scope === "read"
            ? `PERMISSION_DENIED: this SQL needs the 'read' permission to execute. ${suffix}`
            : `PERMISSION_DENIED: this SQL is '${probe.scope === "ddl" ? "DROP TABLE" : "INSERT"}' (write operation) and requires the 'write' permission. ${suffix}`
      expect(output).toBe(denied)
      expect(executedSQL).toEqual([])
      if (probe.scope === "schema")
        expect(requests[0].tools.map((tool) => tool.name)).not.toContain(
          probe.name,
        )
    } else if (probe.name === "validate_query") {
      expect(JSON.parse(output!)).toEqual({ valid: true })
      expect(validatedSQL).toEqual(["SELECT 1"])
    } else if (probe.name === "suggest_query") {
      expect(output).toBe(
        "Query suggestion registered. It will be shown to the user as a suggestion they can accept or reject.",
      )
      expect(result.sql).toBe("SELECT 1;")
    } else if (probe.name === "get_questdb_toc") {
      expect(output).toBe(
        "# QuestDB Documentation Table of Contents\n\n## Functions\ncount()\n\n## Operators\n=\n\n## SQL Syntax & Keywords\nSELECT\n\n",
      )
    } else if (probe.name === "get_tables") {
      expect(JSON.parse(output!)).toEqual([{ name: tableName, type: "table" }])
    } else if (probe.name === "get_table_schema") {
      expect(output).toBe(ddl)
      expect(executedSQL).toEqual([schemaSQL])
    } else if (probe.name === "get_table_details") {
      expect(JSON.parse(output!)).toEqual(details)
      expect(executedSQL).toEqual([detailsSQL])
    } else {
      expect(JSON.parse(output!)).toEqual(
        probe.scope === "read"
          ? {
              type: "dql",
              columns: [{ name: "price", type: "DOUBLE" }],
              rows: [[42], [73]],
              returned_count: 2,
              total_count: 2,
              truncated: false,
              duration_ms: expect.any(Number) as unknown as number,
            }
          : {
              type: probe.scope,
              ok: true,
              message: null,
              duration_ms: expect.any(Number) as unknown as number,
            },
      )
      expect(executedSQL).toEqual([probe.args.sql])
    }
    if (probe.scope === "free") expect(executedSQL).toEqual([])
    if (probe.name === "run_query")
      expect(validatedSQL).toEqual([probe.args.sql])
  })
})
