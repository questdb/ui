// @vitest-environment jsdom
import React from "react"
import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { expect, it, vi } from "vitest"
import { Provider } from "react-redux"
import { createStore } from "redux"
import { ThemeProvider } from "styled-components"
import {
  fixtures,
  getAllByHook,
  getByHook,
  queryByHook,
} from "./support/chatHarness"
import { darkTheme } from "../../../src/theme"
import { TooltipProvider } from "../../../src/components/Tooltip"
import rootReducer from "../../../src/store/reducers"
import { LocalStorageProvider } from "../../../src/providers/LocalStorageProvider"
import { AIConversationProvider } from "../../../src/providers/AIConversationProvider"
import { AIStatusProvider } from "../../../src/providers/AIStatusProvider"
import { MCPBridgeProvider } from "../../../src/providers/MCPBridgeProvider"
import { AIChatWindowLazy } from "../../../src/scenes/Editor/AIChatWindow/AIChatWindowLazy"
import { LocalAgentChatLauncher } from "../../../src/scenes/Layout/LocalAgentChatLauncher"
import { getLocalAgentChannel } from "../../../src/utils/localAgent/localAgentChannel"
import { LOCAL_AGENT_MODEL } from "../../../src/utils/localAgent/localAgentModel"
import {
  installFakeWebSocket,
  TEST_BRIDGE_TOKEN,
  TEST_BRIDGE_URL,
  type BridgeTestWindow,
} from "../../e2e/utils/mcpFakeWebSocket"

const win = window as unknown as BridgeTestWindow
// The model the OpenAI settings fixture selects.
const API_MODEL = "openai:gpt-5-mini"
const API_MODEL_LABEL = "GPT 5 Mini"
const AGENT = { id: "mock-local", label: "Mock local agent", cwd: "/tmp/mock" }

const selectedModel = () =>
  (
    JSON.parse(localStorage.getItem("ai.assistant.settings") ?? "{}") as {
      selectedModel?: string
    }
  ).selectedModel

// The console as a pairing link opens it, with an API model selected and the
// chat closed, as Layout mounts the launcher.
const openPairingLink = async (linkParams: string, apiModel = API_MODEL) => {
  localStorage.setItem(
    "ai.assistant.settings",
    JSON.stringify({
      ...JSON.parse(
        fixtures.getOpenAIConfiguredSettings()["ai.assistant.settings"],
      ),
      selectedModel: apiModel,
    }),
  )
  const original = window.WebSocket
  installFakeWebSocket(window)
  const transport = window.WebSocket
  window.WebSocket = original
  vi.stubGlobal("WebSocket", transport)
  history.replaceState(
    null,
    "",
    `/?mcp-pair=1&mcp-ws=${encodeURIComponent(TEST_BRIDGE_URL)}&mcp-token=${TEST_BRIDGE_TOKEN}&${linkParams}`,
  )
  render(
    <ThemeProvider theme={darkTheme}>
      <TooltipProvider>
        <Provider store={createStore(rootReducer)}>
          <LocalStorageProvider>
            <AIConversationProvider>
              <MCPBridgeProvider>
                <AIStatusProvider>
                  <div id="side-panel-right" />
                  <AIChatWindowLazy />
                  <LocalAgentChatLauncher />
                </AIStatusProvider>
              </MCPBridgeProvider>
            </AIConversationProvider>
          </LocalStorageProvider>
        </Provider>
      </TooltipProvider>
    </ThemeProvider>,
  )
  await waitFor(() =>
    expect(getByHook("mcp-pair-consent-connect")).toBeVisible(),
  )
}

const acceptWith = async (ack: Record<string, unknown>) => {
  await userEvent.click(getByHook("mcp-pair-consent-connect"))
  await waitFor(() =>
    expect(win.__mcpFakeWS.framesOfType("hello")).toHaveLength(1),
  )
  act(() => win.__mcpFakeWS.helloAck(ack))
}

it("opens a blank chat with the agent selected once the agent of an accepted link says hello", async () => {
  // Given a link from the connect command, with an API model selected
  await openPairingLink(
    new URLSearchParams({
      "mcp-agent": AGENT.label,
      "mcp-agent-cwd": AGENT.cwd,
    }).toString(),
  )
  expect(selectedModel()).toBe(API_MODEL)
  expect(queryByHook("ai-chat-window")).not.toBeInTheDocument()

  // When the user accepts and the agent answers hello
  await acceptWith({ agent: AGENT })

  // Then the chat opens, blank, and the next question goes to the agent
  await waitFor(() => expect(getByHook("ai-chat-window")).toBeVisible())
  expect(getLocalAgentChannel()?.info).toEqual(AGENT)
  expect(selectedModel()).toBe(LOCAL_AGENT_MODEL)
  expect(getByHook("chat-input-textarea")).toHaveValue("")
  expect(queryByHook("chat-message-user")).not.toBeInTheDocument()
  expect(fetch).not.toHaveBeenCalled()

  // When the user dismisses the connected dialog, picks the API model again,
  // and the same connection says hello again after a reconnect
  await userEvent.click(getByHook("mcp-pair-consent-cancel"))
  await waitFor(() =>
    expect(queryByHook("mcp-pair-consent-cancel")).not.toBeInTheDocument(),
  )
  await userEvent.click(getByHook("chat-model-picker"))
  await userEvent.type(
    screen.getByRole("combobox", { name: "Search models" }),
    API_MODEL_LABEL,
  )
  await userEvent.click(
    getAllByHook("chat-model-picker-option").find((option) =>
      option.textContent?.includes(API_MODEL_LABEL),
    )!,
  )
  expect(selectedModel()).toBe(API_MODEL)
  act(() => win.__mcpFakeWS.helloAck({ agent: AGENT, resumed: true }))

  // Then only the accepted link chose the agent
  expect(selectedModel()).toBe(API_MODEL)
  expect(getByHook("chat-model-picker")).toHaveTextContent(API_MODEL_LABEL)
})

it("answers on the API model selected before an accepted link once the link's agent is offline", async () => {
  // Given a link from the connect command, with GPT 5, the second enabled
  // API model, selected
  await openPairingLink(
    new URLSearchParams({
      "mcp-agent": AGENT.label,
      "mcp-agent-cwd": AGENT.cwd,
    }).toString(),
    "openai:gpt-5",
  )

  // When the user accepts, the agent says hello, and the bridge then says
  // hello without it, as after the agent stopped
  await acceptWith({ agent: AGENT })
  await waitFor(() => expect(getByHook("ai-chat-window")).toBeVisible())
  expect(selectedModel()).toBe(LOCAL_AGENT_MODEL)
  act(() => win.__mcpFakeWS.helloAck({}))

  // Then GPT 5 answers in the agent's place
  await waitFor(() => expect(getLocalAgentChannel()).toBeNull())
  expect(getByHook("chat-model-picker")).toHaveAccessibleName("Model: GPT 5")
})

it("keeps the chat closed and the API model selected when a terminal agent's link is accepted", async () => {
  // Given a link from a coding agent that works from the terminal
  await openPairingLink("mcp-client=claude-code")

  // When the user accepts and the bridge answers hello without an agent
  await acceptWith({ mcpClient: { name: "claude-code" } })

  // Then the chat stays closed and the API model stays selected
  await waitFor(() => expect(getLocalAgentChannel()).toBeNull())
  expect(queryByHook("ai-chat-window")).not.toBeInTheDocument()
  expect(selectedModel()).toBe(API_MODEL)
})
