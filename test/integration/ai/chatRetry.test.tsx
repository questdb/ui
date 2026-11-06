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
} from "./support/chatHarness"
import { describe, expect, it, vi } from "vitest"
import { act, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
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

const finishScroll = async () => {
  await act(async () => {
    const scrolled = new Promise<void>((resolve) => setTimeout(resolve, 0))
    await vi.advanceTimersByTimeAsync(0)
    await scrolled
  })
}

describe("chat recovery", () => {
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
      await waitFor(() => expect(getByHook("chat-message-error")).toBeVisible())
      expect(getByHook("retry-button")).toBeVisible()
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
    expect(getByHook("chat-message-error")).toBeVisible()
    expect(getByHook("retry-button")).toBeVisible()
    expect(queryByHook("chat-stop-button")).not.toBeInTheDocument()
    expect(requests).toHaveLength(9)
    expect(
      requests.every(
        (request) =>
          request.url === "http://localhost:11434/v1/chat/completions",
      ),
    ).toBe(true)
    await finishScroll()
  })
})
