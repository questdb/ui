// @vitest-environment jsdom
import {
  renderChat,
  openChat,
  sendMessage,
  chatServer,
  fixtures,
  getByHook,
  getAllByHook,
  gate,
  type ProviderName,
} from "./support/chatHarness"
import { describe, expect, it } from "vitest"
import { act, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { actions } from "../../../src/store"
import type { Table } from "../../../src/utils/questdb/types"

describe("chat tools", () => {
  it("retrieves documentation contents through the provider loop and shows usage and operation history", async () => {
    // Given
    const final = gate()
    const server = chatServer("openai", [
      fixtures.createToolCallResponse("openai", "get_questdb_toc", {}),
      async () => {
        await final.promise
        return fixtures.createFinalResponse(
          "openai",
          "Use sum, avg and count for aggregation.",
        )
      },
    ])
    server.other = (request) => {
      expect(request.url).toBe(
        "https://questdb.com/docs/web-console/toc-list.json",
      )
      return Response.json({
        functions: ["sum", "avg", "count"],
        operators: [],
        sql: [],
        concepts: [],
        schema: [],
      })
    }
    renderChat()
    await openChat()

    // When
    await sendMessage("Which aggregate functions can I use?")
    await waitFor(() => expect(server.requests).toHaveLength(2))

    // Then
    const toolOutputs = (
      server.requests[1].body.input as Array<{ type?: string; output?: string }>
    ).filter((item) => item.type === "function_call_output")
    expect(toolOutputs).toHaveLength(1)
    for (const expected of ["sum", "avg", "count", "Functions"])
      expect(toolOutputs[0].output).toContain(expected)
    expect(getByHook("assistant-mode-reviewing-docs")).toBeInTheDocument()
    await final.release()
    await waitFor(() =>
      expect(getByHook("chat-message-assistant")).toHaveTextContent(
        "Use sum, avg and count for aggregation.",
      ),
    )
    await waitFor(() =>
      expect(
        getByHook("assistant-mode-processing-collapsed"),
      ).toBeInTheDocument(),
    )
    await userEvent.click(getByHook("assistant-mode-processing-collapsed"))
    expect(getByHook("assistant-mode-processing-request")).toBeInTheDocument()
    expect(getByHook("assistant-mode-reviewing-docs")).toBeInTheDocument()
    expect(document.querySelector(".token-display")).toHaveTextContent(
      "300 input / 150 output",
    )
  })
})

describe("documentation lookup", () => {
  it("matches a documentation section, sends its content to the model, and presents the suggested SQL", async () => {
    // Given
    const sql = "SELECT sum(price) FROM btc_trades"
    const server = chatServer("openai", [
      fixtures.createToolCallResponse("openai", "get_questdb_documentation", {
        category: "functions",
        items: ["sum"],
      }),
      fixtures.createToolCallResponse("openai", "suggest_query", {
        query: sql,
      }),
      fixtures.createFinalResponse(
        "openai",
        "The sum function adds all prices.",
      ),
    ])
    server.other = (request) => {
      if (request.url.endsWith("/functions-docs.json"))
        return Response.json([
          {
            path: "reference/function/aggregation.md",
            title: "Aggregation Functions",
            headers: ["sum", "avg"],
            url: "https://questdb.com/docs/reference/function/aggregation.md",
          },
        ])
      expect(request.url).toBe(
        "https://questdb.com/docs/reference/function/aggregation.md",
      )
      return new Response(
        "# Aggregation Functions\n\n## sum\nReturns the sum of all values.\n\n## avg\nReturns the average.",
      )
    }
    renderChat()
    await openChat()

    // When
    await sendMessage("How do I sum prices?")

    // Then
    await waitFor(() =>
      expect(getByHook("chat-message-assistant")).toHaveTextContent(
        "The sum function adds all prices.",
      ),
    )
    expect(server.requests).toHaveLength(3)
    expect(JSON.stringify(server.requests[1].body)).toContain(
      "Returns the sum of all values.",
    )
    await waitFor(() =>
      expect(getByHook("inline-diff-container")).toHaveTextContent(sql),
    )
    expect(getByHook("message-action-accept")).toBeEnabled()
    await userEvent.click(getByHook("assistant-mode-processing-collapsed"))
    expect(getByHook("assistant-mode-investigating-docs")).toBeInTheDocument()
    expect(document.querySelector(".token-display")).toHaveTextContent(
      "400 input / 200 output",
    )
  })
})

const thinkingTool = (
  provider: ProviderName,
  thinking: string,
  name = "validate_query",
  args: Record<string, unknown> = { query: "SELECT 1" },
  text = "",
) =>
  fixtures.createResponse(
    provider,
    provider === "anthropic"
      ? {
          id: "msg_thinking",
          type: "message",
          role: "assistant",
          model: "claude-sonnet-4-5",
          content: [
            { type: "thinking", thinking },
            { type: "tool_use", id: `call_${name}`, name, input: args },
          ],
          stop_reason: "tool_use",
          usage: { input_tokens: 100, output_tokens: 50 },
        }
      : {
          id: `resp_${name}`,
          object: "response",
          created_at: Date.now(),
          status: "completed",
          output: [
            ...(text
              ? [
                  {
                    type: "message",
                    role: "assistant",
                    content: [{ type: "output_text", text }],
                  },
                ]
              : []),
            {
              type: "function_call",
              id: `fc_${name}`,
              name,
              arguments: JSON.stringify(args),
              call_id: `call_${name}`,
            },
          ],
          output_text: text,
          _reasoning: thinking,
          usage: { input_tokens: 100, output_tokens: 50 },
        },
  )

const pauseAfterReasoning = (
  provider: ProviderName,
  response: ReturnType<typeof fixtures.createResponse>,
) => {
  const pause = gate()
  const body = String(response.body)
  const boundary = body.indexOf(
    provider === "anthropic"
      ? "event: content_block_stop"
      : "event: response.completed",
  )
  if (boundary < 0) throw new Error("Missing reasoning stream boundary")
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(body.slice(0, boundary)))
      await pause.promise
      controller.enqueue(encoder.encode(body.slice(boundary)))
      controller.close()
    },
  })
  return { response: { ...response, body: stream }, release: pause.release }
}

describe.each(["openai", "anthropic"] as const)("%s reasoning", (provider) => {
  it("shows live reasoning, collapses it after completion, and lets the user read it again", async () => {
    // Given
    const thinking = "I should validate the query before explaining it."
    const final = gate()
    const reasoning = pauseAfterReasoning(
      provider,
      thinkingTool(provider, thinking),
    )
    const server = chatServer(provider, [
      reasoning.response,
      async () => {
        await final.promise
        return fixtures.createFinalResponse(provider, "This query returns one.")
      },
    ])
    server.other = (request) => {
      expect(new URL(request.url).searchParams.get("query")).toBe("SELECT 1")
      return Response.json({ query: "SELECT 1", type: "select" })
    }
    renderChat(provider)
    await openChat()

    // When
    await sendMessage("Explain SELECT 1")
    await waitFor(() =>
      expect(getByHook("assistant-mode-thinking")).toBeVisible(),
    )

    // Then
    expect(getByHook("assistant-mode-thinking")).toHaveAttribute(
      "aria-expanded",
      "true",
    )
    await waitFor(() => expect(screen.getByText(thinking)).toBeVisible())
    await reasoning.release()
    await waitFor(() => expect(server.requests).toHaveLength(2))
    await final.release()
    await waitFor(() =>
      expect(getByHook("chat-message-assistant")).toHaveTextContent(
        "This query returns one.",
      ),
    )
    expect(getByHook("assistant-mode-processing-collapsed")).toHaveAttribute(
      "aria-expanded",
      "false",
    )
    expect(screen.getByText(thinking)).not.toBeVisible()
    await userEvent.click(getByHook("assistant-mode-processing-collapsed"))
    expect(getByHook("assistant-mode-processing-collapsed")).toHaveAttribute(
      "aria-expanded",
      "true",
    )
    expect(getByHook("assistant-mode-thinking")).toHaveAttribute(
      "aria-expanded",
      "false",
    )
    await userEvent.click(getByHook("assistant-mode-thinking"))
    expect(getByHook("assistant-mode-thinking")).toHaveAttribute(
      "aria-expanded",
      "true",
    )
    expect(screen.getByText(thinking)).toBeVisible()
  })
})

describe("interleaved tool conversation", () => {
  it("preserves thinking, intermediate text, operations and SQL across five provider rounds", async () => {
    // Given
    const sql = "SELECT symbol, avg(price) FROM btc_trades"
    const gates = Array.from({ length: 4 }, gate)
    const firstReasoning = pauseAfterReasoning(
      "openai",
      thinkingTool(
        "openai",
        "Let me check the available tables.",
        "get_tables",
        {},
      ),
    )
    const secondReasoning = pauseAfterReasoning(
      "openai",
      thinkingTool(
        "openai",
        "The symbol and price columns need GROUP BY.",
        "validate_query",
        { query: sql },
      ),
    )
    const replies = [
      firstReasoning.response,
      thinkingTool(
        "openai",
        "",
        "get_table_schema",
        { table_name: "btc_trades" },
        "I found btc_trades. I will inspect its schema.",
      ),
      secondReasoning.response,
      thinkingTool(
        "openai",
        "",
        "suggest_query",
        { query: sql },
        "The query is valid. Here is my suggestion.",
      ),
      fixtures.createFinalResponse(
        "openai",
        "This query groups trades by symbol and averages their price.",
      ),
    ]
    const server = chatServer(
      "openai",
      replies.map((reply, index) =>
        index === 0
          ? reply
          : async () => {
              await gates[index - 1].promise
              return reply
            },
      ),
    )
    server.other = (request) => {
      const query = new URL(request.url).searchParams.get("query")
      if (query === "SHOW CREATE TABLE 'btc_trades';")
        return Response.json({
          columns: [{ name: "ddl", type: "STRING" }],
          dataset: [["CREATE TABLE btc_trades (symbol SYMBOL, price DOUBLE);"]],
          count: 1,
        })
      expect(query).toBe(sql)
      return Response.json({ query: sql, type: "select" })
    }
    const { store } = renderChat()
    act(() => {
      store.dispatch(
        actions.query.setTables([
          {
            id: 1,
            table_name: "btc_trades",
            designatedTimestamp: "",
            partitionBy: "NONE",
            walEnabled: false,
            directoryName: "btc_trades",
            dedup: false,
            maxUncommittedRows: 1000,
            o3MaxLag: BigInt(0),
          } as Table,
        ]),
      )
    })
    await openChat()

    // When
    await sendMessage("What is the average price per symbol?")

    // Then
    await waitFor(() =>
      expect(
        screen.getByText("Let me check the available tables."),
      ).toBeVisible(),
    )
    expect(getByHook("assistant-mode-thinking")).toHaveAttribute(
      "aria-expanded",
      "true",
    )
    await firstReasoning.release()
    await waitFor(() => expect(server.requests).toHaveLength(2))
    expect(getByHook("assistant-mode-reviewing-tables")).toBeInTheDocument()
    await gates[0].release()
    await waitFor(() => expect(server.requests).toHaveLength(3))
    expect(getByHook("chat-message-assistant")).toHaveTextContent(
      "I found btc_trades.",
    )
    expect(getByHook("assistant-mode-investigating-table")).toBeInTheDocument()
    expect(JSON.stringify(server.requests[2].body)).toContain(
      "CREATE TABLE btc_trades",
    )
    await gates[1].release()
    await waitFor(() =>
      expect(
        screen.getByText("The symbol and price columns need GROUP BY."),
      ).toBeVisible(),
    )
    expect(getAllByHook("assistant-mode-thinking").at(-1)).toHaveAttribute(
      "aria-expanded",
      "true",
    )
    await secondReasoning.release()
    await waitFor(() => expect(server.requests).toHaveLength(4))
    expect(getByHook("assistant-mode-validating-query")).toBeInTheDocument()
    await gates[2].release()
    await waitFor(() => expect(server.requests).toHaveLength(5))
    expect(getByHook("chat-message-assistant")).toHaveTextContent(
      "The query is valid.",
    )
    await gates[3].release()
    await waitFor(() =>
      expect(getByHook("chat-message-assistant")).toHaveTextContent(
        "This query groups trades by symbol",
      ),
    )
    await waitFor(() =>
      expect(getByHook("inline-diff-container")).toHaveTextContent(sql),
    )
    const collapsedGroups = getAllByHook("assistant-mode-processing-collapsed")
    expect(collapsedGroups.length).toBeGreaterThan(1)
    expect(
      screen.getByText("Let me check the available tables."),
    ).not.toBeVisible()
    expect(
      screen.getByText("The symbol and price columns need GROUP BY."),
    ).not.toBeVisible()
    for (const collapsed of collapsedGroups) {
      expect(collapsed).toHaveAttribute("aria-expanded", "false")
      await userEvent.click(collapsed)
      expect(collapsed).toHaveAttribute("aria-expanded", "true")
    }
    const thinkingSections = getAllByHook("assistant-mode-thinking")
    expect(thinkingSections).toHaveLength(2)
    for (const thinking of thinkingSections) {
      expect(thinking).toHaveAttribute("aria-expanded", "false")
      await userEvent.click(thinking)
      expect(thinking).toHaveAttribute("aria-expanded", "true")
    }
    expect(screen.getByText("Let me check the available tables.")).toBeVisible()
    expect(
      screen.getByText("The symbol and price columns need GROUP BY."),
    ).toBeVisible()
    expect(getByHook("assistant-mode-reviewing-tables")).toBeInTheDocument()
    expect(getByHook("assistant-mode-investigating-table")).toBeInTheDocument()
    expect(getByHook("assistant-mode-validating-query")).toBeInTheDocument()
  })
})
