// @vitest-environment jsdom
import React from "react"
import { act, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { expect, it, vi } from "vitest"
import {
  chatServer,
  fixtures,
  getAllByHook,
  getByHook,
  openChat,
  renderChat,
  sendMessage,
} from "./support/chatHarness"
import { Button } from "../../../src/components/Button"
import { useMCPBridge } from "../../../src/providers/MCPBridgeProvider"
import type { AiAssistantSettings } from "../../../src/providers/LocalStorageProvider/types"
import type {
  AgentConfig,
  AgentConfigChoice,
} from "../../../src/utils/localAgent/protocol"
import { LOCAL_AGENT_MODEL } from "../../../src/utils/localAgent/localAgentModel"
import { EXPECTED_MCP_VERSION as v } from "../../../src/utils/mcp/protocolVersion"
import {
  installFakeWebSocket,
  TEST_BRIDGE_TOKEN,
  TEST_BRIDGE_URL,
  type BridgeTestWindow,
} from "../../e2e/utils/mcpFakeWebSocket"

const win = window as unknown as BridgeTestWindow
const AGENT = { id: "claude-code", label: "Claude Code", cwd: "/tmp/mock" }

const choice = (value: string, name: string): AgentConfigChoice => ({
  value,
  name,
  description: null,
  group: null,
})

// An agent that lists its models and its effort levels, on Opus and medium.
const AGENT_CONFIG: AgentConfig = {
  model: {
    id: "model",
    current: "opus",
    choices: [choice("opus", "Opus"), choice("sonnet", "Sonnet")],
  },
  effort: {
    id: "effort",
    current: "medium",
    choices: [
      choice("low", "low"),
      choice("medium", "medium"),
      choice("high", "high"),
    ],
  },
}

const storedSettings = () =>
  JSON.parse(
    localStorage.getItem("ai.assistant.settings") ?? "{}",
  ) as AiAssistantSettings

// The preferences the console sent the agent, oldest first.
const sentPreferences = () =>
  win.__mcpFakeWS
    .framesOfType("agent_settings")
    .map(({ model, effort }) => ({ model, effort }))

const ConnectBridge = () => {
  const { connect } = useMCPBridge()
  return (
    <Button onClick={() => connect(TEST_BRIDGE_URL, TEST_BRIDGE_TOKEN)}>
      Connect fake bridge
    </Button>
  )
}

// The chat on the fixture's API model, or the one the settings select, with an
// agent paired and ready.
const openChatWithAgent = async (
  config: AgentConfig,
  settings?: AiAssistantSettings,
) => {
  const original = window.WebSocket
  installFakeWebSocket(window)
  const transport = window.WebSocket
  window.WebSocket = original
  vi.stubGlobal("WebSocket", transport)
  renderChat("openai", <ConnectBridge />, settings, { bridge: true })
  await userEvent.click(
    screen.getByRole("button", { name: "Connect fake bridge" }),
  )
  await waitFor(() =>
    expect(win.__mcpFakeWS.framesOfType("hello")).toHaveLength(1),
  )
  act(() => {
    win.__mcpFakeWS.helloAck({ agent: AGENT })
    win.__mcpFakeWS.receive({
      v,
      type: "agent_status",
      state: "ready",
      config,
      error: null,
    })
  })
  await openChat()
}

const pickFromModelPicker = async (label: string) => {
  await userEvent.click(getByHook("chat-model-picker"))
  await userEvent.type(
    screen.getByRole("combobox", { name: "Search models" }),
    label,
  )
  await userEvent.click(
    getAllByHook("chat-model-picker-option").find(
      (option) =>
        option.querySelector('[data-hook="chat-model-picker-option-label"]')
          ?.textContent === label,
    )!,
  )
}

const pickFromEffortPicker = async (label: string) => {
  await userEvent.click(getByHook("chat-effort-picker"))
  await userEvent.click(
    await screen.findByRole("menuitemradio", { name: label }),
  )
}

const runCommand = async (command: string) => {
  await userEvent.click(getByHook("chat-input-textarea"))
  await userEvent.keyboard(`${command}{Enter}`)
}

it.each([
  {
    route: "the pickers",
    chooseModel: () => pickFromModelPicker("Sonnet"),
    chooseEffort: () => pickFromEffortPicker("Low"),
  },
  {
    route: "/model and /effort",
    chooseModel: () => runCommand("/model sonnet"),
    chooseEffort: () => runCommand("/effort low"),
  },
])(
  "selects the agent and saves its model and effort when chosen through $route",
  async ({ chooseModel, chooseEffort }) => {
    // Given the chat on an API model, with an agent that lists models
    await openChatWithAgent(AGENT_CONFIG)
    const apiProviders = storedSettings().providers
    expect(storedSettings().selectedModel).toBe("openai:gpt-5-mini")
    expect(sentPreferences()).toEqual([{ model: null, effort: null }])

    // When the user chooses one of the agent's models
    await chooseModel()

    // Then the chat goes to the agent, which is told to use that model
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Model: Sonnet · Claude Code" }),
      ).toBeVisible(),
    )
    expect(storedSettings().selectedModel).toBe("local-agent")
    expect(storedSettings().localAgent?.preferences).toEqual({
      [AGENT.id]: { model: "sonnet" },
    })
    expect(sentPreferences()).toEqual([
      { model: null, effort: null },
      { model: "sonnet", effort: null },
    ])
    expect(getByHook("chat-effort-picker")).toHaveAccessibleName(
      "Effort: Medium",
    )

    // When the user chooses one of the agent's effort levels
    await chooseEffort()

    // Then the agent keeps the model and is told to use that effort, and the
    // API provider's effort stays as it was
    await waitFor(() =>
      expect(getByHook("chat-effort-picker")).toHaveAccessibleName(
        "Effort: Low",
      ),
    )
    expect(storedSettings().localAgent?.preferences).toEqual({
      [AGENT.id]: { model: "sonnet", effort: "low" },
    })
    expect(storedSettings().providers).toEqual(apiProviders)
    expect(sentPreferences()).toEqual([
      { model: null, effort: null },
      { model: "sonnet", effort: null },
      { model: "sonnet", effort: "low" },
    ])
    expect(
      screen.getByRole("button", { name: "Model: Sonnet · Claude Code" }),
    ).toBeVisible()
  },
)

it("selects an agent that lists no models on its own default model", async () => {
  // Given the chat on an API model, with an agent that lists no models
  await openChatWithAgent({ model: null, effort: null })

  // When the user picks the agent's default model
  await pickFromModelPicker("Default model")

  // Then the chat goes to the agent, named without a model, and no model
  // is saved or sent for it
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Model: Claude Code" }),
    ).toBeVisible(),
  )
  expect(storedSettings().selectedModel).toBe("local-agent")
  expect(storedSettings().localAgent?.preferences).toEqual({ [AGENT.id]: {} })
  expect(sentPreferences()).toEqual([{ model: null, effort: null }])
})

// The OpenAI fixture on GPT 5, its second enabled model.
const gpt5Selected = (): AiAssistantSettings => ({
  ...(JSON.parse(
    fixtures.getOpenAIConfiguredSettings()["ai.assistant.settings"],
  ) as AiAssistantSettings),
  selectedModel: "openai:gpt-5",
})

it.each([
  {
    route: "the model picker",
    chooseAgent: () => pickFromModelPicker("Sonnet"),
  },
  { route: "/model", chooseAgent: () => runCommand("/model sonnet") },
])(
  "answers on the API model chosen before the agent once the agent chosen through $route is offline",
  async ({ chooseAgent }) => {
    // Given the chat on GPT 5, the second enabled API model, with an agent
    const server = chatServer("openai", [
      fixtures.createFinalResponse("openai", "Answer from GPT 5."),
    ])
    await openChatWithAgent(AGENT_CONFIG, gpt5Selected())
    expect(getByHook("chat-model-picker")).toHaveAccessibleName("Model: GPT 5")

    // When the user chooses the agent, and the bridge then says hello
    // without it, as after the agent stopped
    await chooseAgent()
    await waitFor(() =>
      expect(getByHook("chat-model-picker")).toHaveAccessibleName(
        "Model: Sonnet · Claude Code",
      ),
    )
    act(() => win.__mcpFakeWS.helloAck({}))

    // Then GPT 5 answers in the agent's place
    await waitFor(() =>
      expect(getByHook("chat-model-picker")).toHaveAccessibleName(
        "Model: GPT 5",
      ),
    )
    await sendMessage("How many trades are there?")
    await waitFor(() =>
      expect(getByHook("chat-response-content")).toHaveTextContent(
        "Answer from GPT 5.",
      ),
    )
    expect(server.requests.map(({ body }) => body.model)).toEqual(["gpt-5"])
  },
)

it("names a new chat with the custom model that answers while the selected agent is offline", async () => {
  // Given the agent selected before any API model was chosen, a custom
  // provider's model enabled since, and the agent offline
  const server = chatServer("openai-chat-completions", [
    fixtures.createFinalResponse(
      "openai-chat-completions",
      "Answer from llama3.",
    ),
  ])
  renderChat("openai-chat-completions", undefined, {
    modelValueFormat: 2,
    selectedModel: LOCAL_AGENT_MODEL,
    providers: {},
    customProviders: {
      local: {
        type: "openai-chat-completions",
        name: "Local provider",
        baseURL: "http://localhost:11434/v1",
        contextWindow: 200000,
        models: ["llama3"],
      },
    },
  })
  await openChat()

  // When the user asks the first question of the chat
  await sendMessage("Show me the trades table")

  // Then llama3 answers it and names the chat
  await waitFor(() =>
    expect(getByHook("chat-response-content")).toHaveTextContent(
      "Answer from llama3.",
    ),
  )
  await waitFor(() =>
    expect(getByHook("chat-window-title")).toHaveTextContent("Test Chat"),
  )
  expect(server.requests.map(({ body }) => body.model)).toEqual(["llama3"])
  expect(server.titleRequests.map(({ model }) => model)).toEqual(["llama3"])
})

it("selects the agent from the chat button when no API model can answer, keeping the API model selected before it", async () => {
  // Given GPT 5 selected but its API key removed, with an agent
  const settings = gpt5Selected()
  settings.providers.openai = { ...settings.providers.openai!, apiKey: "" }

  // When the user opens the chat from the chat button
  await openChatWithAgent(AGENT_CONFIG, settings)

  // Then the chat goes to the agent, and GPT 5 stays the API model that
  // answers while the agent is offline
  expect(getByHook("chat-model-picker")).toHaveAccessibleName(
    "Model: Opus · Claude Code",
  )
  expect(storedSettings()).toMatchObject({
    selectedModel: LOCAL_AGENT_MODEL,
    localAgent: { apiModel: "openai:gpt-5" },
  })
})
