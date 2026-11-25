// @vitest-environment jsdom
import React from "react"
import { act, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { expect, it, vi } from "vitest"
import {
  getAllByHook,
  getByHook,
  openChat,
  renderChat,
} from "./support/chatHarness"
import { Button } from "../../../src/components/Button"
import { useMCPBridge } from "../../../src/providers/MCPBridgeProvider"
import type { AiAssistantSettings } from "../../../src/providers/LocalStorageProvider/types"
import type {
  AgentConfig,
  AgentConfigChoice,
} from "../../../src/utils/localAgent/protocol"
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

// The chat on the fixture's API model, with an agent paired and ready.
const openChatWithAgent = async (config: AgentConfig) => {
  const original = window.WebSocket
  installFakeWebSocket(window)
  const transport = window.WebSocket
  window.WebSocket = original
  vi.stubGlobal("WebSocket", transport)
  renderChat("openai", <ConnectBridge />, undefined, { bridge: true })
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
