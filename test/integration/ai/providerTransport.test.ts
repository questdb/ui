import "../../../src/test/stubBrowserGlobals"
import { createRequire } from "node:module"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createProvider } from "../../../src/utils/ai/registry"
import { createModelToolsClient } from "../../../src/utils/ai/aiAssistant"
import { Client } from "../../../src/utils/questdb/client"
import type { AiAssistantSettings } from "../../../src/providers/LocalStorageProvider/types"

type ProviderType = "anthropic" | "openai-chat-completions"
const fixtures = createRequire(import.meta.url)(
  "../../e2e/utils/aiAssistant.js",
) as {
  createFinalResponse: (
    provider: ProviderType,
    explanation: string,
    options: { streaming: boolean },
  ) => { body: string; headers: Record<string, string> }
}

const runCustomChat = async (type: ProviderType, apiKey: string) => {
  const model = type === "anthropic" ? "claude-custom" : "local-model"
  const baseURL =
    type === "anthropic" ? "http://localhost:8080" : "http://localhost:11434/v1"
  const settings: AiAssistantSettings = {
    modelValueFormat: 2,
    selectedModel: `custom:${model}`,
    providers: {
      custom: {
        apiKey,
        enabledModels: [`custom:${model}`],
        grantSchemaAccess: false,
      },
    },
    customProviders: {
      custom: {
        name: "Local provider",
        type,
        baseURL,
        models: [model],
        contextWindow: 200000,
        grantSchemaAccess: false,
      },
    },
  }
  localStorage.setItem("ai.assistant.settings", JSON.stringify(settings))
  const requests: Array<{ request: Request; body: Record<string, unknown> }> =
    []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request =
        input instanceof Request ? input : new Request(input, init)
      requests.push({
        request,
        body: (await request.json()) as Record<string, unknown>,
      })
      const response = fixtures.createFinalResponse(
        type,
        "The custom provider answered.",
        { streaming: true },
      )
      return new Response(response.body, { headers: response.headers })
    }),
  )
  const provider = createProvider(
    "custom",
    apiKey,
    JSON.parse(
      localStorage.getItem("ai.assistant.settings")!,
    ) as AiAssistantSettings,
  )
  const client = new Client()
  const chunks: string[] = []
  const result = await provider.executeFlow({
    model: settings.selectedModel!,
    config: {
      systemInstructions: "Answer briefly.",
      initialUserContent: "Say hello.",
    },
    modelToolsClient: createModelToolsClient(client),
    tools: [],
    setStatus: vi.fn(),
    perms: { grantSchemaAccess: false, read: false, write: false },
    validateSql: (sql) => client.validateQuery(sql),
    streaming: { onTextChunk: (chunk) => chunks.push(chunk) },
  })
  return { requests, result, text: chunks.join("") }
}

afterEach(() => {
  localStorage.clear()
  vi.unstubAllGlobals()
})

describe("custom provider transport", () => {
  it("routes a namespaced Anthropic model to its custom endpoint and parses the real SDK stream", async () => {
    // Given saved custom Anthropic settings
    // When the real registry and SDK send a streamed chat
    const { requests, result, text } = await runCustomChat(
      "anthropic",
      "test-anthropic-key",
    )

    // Then no public endpoint is used and the streamed answer reaches the caller
    expect(requests).toHaveLength(1)
    expect(requests[0].request.url).toBe("http://localhost:8080/v1/messages")
    expect(requests[0].request.method).toBe("POST")
    expect(requests[0].body).toMatchObject({
      model: "claude-custom",
      stream: true,
    })
    expect(requests[0].request.headers.get("x-api-key")).toBe(
      "test-anthropic-key",
    )
    expect(text).toBe("The custom provider answered.")
    expect(result).toMatchObject({ explanation: text, sql: null })
  })

  it.each([
    {
      label: "no credential (the SDK sends a bare Bearer header)",
      apiKey: "",
      authorization: "Bearer",
    },
    {
      label: "the configured Bearer credential",
      apiKey: "sk-test-key-123",
      authorization: "Bearer sk-test-key-123",
    },
  ])("sends $label to Chat Completions", async ({ apiKey, authorization }) => {
    // Given a saved custom Chat Completions provider with the selected key
    // When the real registry, SDK, and header filter send a streamed chat
    const { requests, result, text } = await runCustomChat(
      "openai-chat-completions",
      apiKey,
    )

    // Then the exact authorization contract and parsed response reach their destinations
    expect(requests).toHaveLength(1)
    expect(requests[0].request.url).toBe(
      "http://localhost:11434/v1/chat/completions",
    )
    expect(requests[0].body).toMatchObject({
      model: "local-model",
      stream: true,
    })
    expect(requests[0].request.headers.get("authorization")).toBe(authorization)
    const headerNames: string[] = []
    requests[0].request.headers.forEach((_value, name) => {
      headerNames.push(name)
    })
    expect(headerNames.sort()).toEqual(["authorization", "content-type"])
    expect(text).toBe("The custom provider answered.")
    expect(result).toMatchObject({ explanation: text, sql: null })
  })
})
