// @vitest-environment jsdom
import {
  renderChat,
  openChat,
  sendMessage,
  chatServer,
  fixtures,
  getByHook,
  queryByHook,
  getAllByHook,
  httpResponse,
  failQuery,
  seedChat,
} from "./support/chatHarness"
import React from "react"
import { describe, expect, it, vi } from "vitest"
import { act, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Button } from "../../../src/components/Button"
import { useAIQuickActions } from "../../../src/hooks/useAIQuickActions"
import type { AiAssistantSettings } from "../../../src/providers/LocalStorageProvider/types"

const customSettings: AiAssistantSettings = {
  modelValueFormat: 2,
  selectedModel: "local:local-model",
  providers: {
    local: {
      apiKey: "test-key",
      enabledModels: ["local:local-model"],
      grantSchemaAccess: false,
    },
  },
  customProviders: {
    local: {
      name: "Local provider",
      type: "openai-chat-completions",
      baseURL: "http://localhost:11434/v1",
      models: ["local-model"],
      contextWindow: 200000,
      grantSchemaAccess: false,
    },
  },
}

const unauthorized = {
  statusCode: 401,
  body: {
    type: "error",
    error: { type: "authentication_error", message: "Invalid API key" },
  },
}

const finishRetries = async (releaseFirstResponse: () => void) => {
  const retryTime = Date.now()
  vi.useRealTimers()
  vi.useFakeTimers({
    toFake: [
      "Date",
      "setTimeout",
      "clearTimeout",
      "setInterval",
      "clearInterval",
    ],
  })
  vi.setSystemTime(retryTime)
  await act(async () => {
    releaseFirstResponse()
    await vi.advanceTimersByTimeAsync(20000)
  })
}

const failedSQL = "SELECT * FROM tradess"
const ddl = "CREATE TABLE trades (price DOUBLE);"

const ExplainSchema = () => {
  const { handleExplainSchema } = useAIQuickActions()
  return (
    <Button onClick={() => void handleExplainSchema(1, "trades", "table")}>
      Explain schema
    </Button>
  )
}

const lastUserText = (body: Record<string, unknown>) => {
  const messages = body.messages as Array<{
    role: string
    content: string | Array<{ text?: string }>
  }>
  const content = messages.filter(({ role }) => role === "user").at(-1)!.content
  return typeof content === "string"
    ? content
    : content.map(({ text = "" }) => text).join("")
}

const finishScroll = async () => {
  await act(async () => {
    const scrolled = new Promise<void>((resolve) => setTimeout(resolve, 0))
    await vi.advanceTimersByTimeAsync(0)
    await scrolled
  })
}

describe("chat recovery", () => {
  it("preserves a failed table diagnosis when the selected model lacks schema access", async () => {
    await seedChat("Table diagnosis", {
      tableId: 1,
      messages: [
        {
          id: "diagnosis",
          role: "user",
          content: "Private table diagnostics",
          timestamp: Date.now(),
          displayType: "health_issue_request",
          displayHealthIssueData: {
            tableName: "trades",
            issueMessage: "Small transactions",
            severity: "warning",
          },
        },
        {
          id: "failed-answer",
          role: "assistant",
          content: null,
          error: "Connection lost",
          timestamp: Date.now(),
        },
      ],
    })
    renderChat("openai-chat-completions", undefined, customSettings)
    await openChat()
    await userEvent.click(getByHook("retry-button"))

    expect(
      await screen.findByText("Enable schema access before retrying."),
    ).toBeVisible()
    expect(getByHook("chat-message-error")).toHaveTextContent("Connection lost")
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each(["anthropic", "openai-chat-completions"] as const)(
    "retries the failed %s question and replaces its error with the answer",
    async (provider) => {
      // Given a real chat whose provider rejects the first request
      const question = "Show the prices from yesterday."
      const server = chatServer(provider, [
        unauthorized,
        fixtures.createFinalResponse(provider, "The retry succeeded."),
      ])
      renderChat(
        provider,
        undefined,
        provider === "anthropic" ? undefined : customSettings,
      )
      await openChat()
      await sendMessage(question)
      await waitFor(() => expect(getByHook("retry-button")).toBeEnabled())
      expect(getByHook("chat-message-error")).toBeVisible()
      expect(server.requests).toHaveLength(1)

      // When the user retries after the provider recovers
      vi.setSystemTime(Date.now() + 3000)
      await userEvent.click(getByHook("retry-button"))

      // Then the same question reaches the same endpoint once more and the error disappears
      await waitFor(() =>
        expect(getByHook("chat-message-assistant")).toHaveTextContent(
          "The retry succeeded.",
        ),
      )
      expect(queryByHook("chat-message-error")).not.toBeInTheDocument()
      expect(queryByHook("retry-button")).not.toBeInTheDocument()
      expect(server.requests).toHaveLength(2)
      expect(server.requests[1].request.url).toBe(
        server.requests[0].request.url,
      )
      expect(server.requests[1].body.model).toBe(server.requests[0].body.model)
      expect(JSON.stringify(server.requests[1].body.messages)).toContain(
        question,
      )
      expect(getAllByHook("chat-message-user")).toHaveLength(1)
      await waitFor(() =>
        expect(queryByHook("chat-stop-button")).not.toBeInTheDocument(),
      )
      await finishScroll()
    },
  )

  it.each([
    {
      action: "Explain query",
      asked: ["explain this SQL query", failedSQL],
      retried: ["explain this SQL query", failedSQL],
      ddlReads: 0,
    },
    {
      action: "Fix query",
      asked: [
        "Fix this SQL query",
        failedSQL,
        "Error: table does not exist [table=tradess]",
        'Error near: "tradess"',
      ],
      retried: ["Fix this SQL query", failedSQL],
      ddlReads: 0,
    },
    {
      action: "Explain schema",
      asked: [ddl],
      retried: [ddl],
      ddlReads: 2,
    },
  ])(
    "retries a failed $action answer with one new request",
    async ({ action, asked, retried, ddlReads }) => {
      // Given a chat about a failed query and a provider that rejects the first request
      const queryKey = failQuery(1, failedSQL, {
        message: "table does not exist [table=tradess]",
        position: 14,
      })
      await seedChat("Failed query", {
        bufferId: 1,
        queryKey,
        currentSQL: failedSQL,
        messages: [],
      })
      const server = chatServer("anthropic", [
        unauthorized,
        fixtures.createFinalResponse("anthropic", "The retry succeeded."),
      ])
      server.other = (request) => {
        expect(new URL(request.url).searchParams.get("query")).toBe(
          "SHOW CREATE TABLE 'trades';",
        )
        return Response.json({
          columns: [{ name: "ddl", type: "STRING" }],
          dataset: [[ddl]],
          count: 1,
        })
      }
      renderChat("anthropic", <ExplainSchema />)
      await openChat()
      await userEvent.click(
        screen.getByRole("button", { name: new RegExp(`^${action}`) }),
      )
      await waitFor(() => expect(getByHook("retry-button")).toBeEnabled())
      expect(server.requests).toHaveLength(1)
      for (const part of asked)
        expect(lastUserText(server.requests[0].body)).toContain(part)

      // When the user retries after the provider recovers
      vi.setSystemTime(Date.now() + 3000)
      await userEvent.click(getByHook("retry-button"))

      // Then the same request goes out once more and its answer replaces the error
      await waitFor(() =>
        expect(getByHook("chat-message-assistant")).toHaveTextContent(
          "The retry succeeded.",
        ),
      )
      expect(server.requests).toHaveLength(2)
      for (const part of retried)
        expect(lastUserText(server.requests[1].body)).toContain(part)
      expect(server.otherRequests).toHaveLength(ddlReads)
      expect(queryByHook("chat-message-error")).not.toBeInTheDocument()
      expect(getAllByHook("chat-message-user")).toHaveLength(1)
      await waitFor(() =>
        expect(queryByHook("chat-stop-button")).not.toBeInTheDocument(),
      )
      await finishScroll()
    },
  )

  it("keeps the failed schema answer when Retry cannot read the dropped table's schema", async () => {
    // Given a failed schema answer for a table that is dropped afterwards
    const server = chatServer("anthropic", [unauthorized])
    const schemaReads: string[] = []
    server.other = (request) => {
      const query = new URL(request.url).searchParams.get("query")!
      schemaReads.push(query)
      return schemaReads.length === 1
        ? Response.json({
            columns: [{ name: "ddl", type: "STRING" }],
            dataset: [[ddl]],
            count: 1,
          })
        : Response.json(
            {
              query,
              error: "table does not exist [table=trades]",
              position: 18,
            },
            { status: 400 },
          )
    }
    renderChat("anthropic", <ExplainSchema />)
    await userEvent.click(
      screen.getByRole("button", { name: "Explain schema" }),
    )
    await waitFor(() => expect(getByHook("retry-button")).toBeEnabled())

    // When the user retries
    vi.setSystemTime(Date.now() + 3000)
    await userEvent.click(getByHook("retry-button"))

    // Then the chat says the retry could not start and keeps the failed turn
    expect(
      await screen.findByText(
        "Could not prepare the retry. The failed message was kept.",
      ),
    ).toBeVisible()
    expect(schemaReads).toEqual([
      "SHOW CREATE TABLE 'trades';",
      "SHOW CREATE TABLE 'trades';",
    ])
    expect(server.requests).toHaveLength(1)
    expect(getAllByHook("chat-message-user")).toHaveLength(1)
    expect(getByHook("chat-message-error")).toBeVisible()
    expect(getByHook("retry-button")).toBeEnabled()
  })

  it("shows a recoverable error when the custom provider cannot be reached", async () => {
    // Given a configured provider with a failed HTTP connection
    const requests: Request[] = []
    let releaseFirstResponse!: () => void
    const firstResponse = new Promise<void>((resolve) => {
      releaseFirstResponse = resolve
    })
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request =
          input instanceof Request ? input : new Request(input, init)
        const body = (await request.clone().json()) as Record<string, unknown>
        if (fixtures.isTitleRequest("openai-chat-completions", body)) {
          return httpResponse(
            fixtures.createChatTitleResponse("openai-chat-completions"),
          )
        }
        requests.push(request)
        if (requests.length === 1) await firstResponse
        throw new TypeError("Failed to fetch")
      }),
    )
    renderChat("openai-chat-completions", undefined, customSettings)
    await openChat()

    // When the user sends a question and transport retries also fail
    await sendMessage("Can you read the latest prices?")
    await waitFor(() => expect(requests).toHaveLength(1))
    await finishRetries(releaseFirstResponse)

    // Then the real chat stops streaming and offers Retry without a false success
    vi.useRealTimers()
    await waitFor(() => expect(getByHook("retry-button")).toBeEnabled())
    expect(getByHook("chat-message-error")).toBeVisible()
    expect(queryByHook("chat-stop-button")).not.toBeInTheDocument()
    expect(requests).toHaveLength(9)
    expect(
      requests.every(
        (request) =>
          request.url === "http://localhost:11434/v1/chat/completions",
      ),
    ).toBe(true)
  })
})
