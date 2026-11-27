// @vitest-environment jsdom

import {
  ChatModelControls,
  getAllByHook,
  getByHook,
  modelServer,
  openConfiguration,
  openModelPicker,
  openSettings,
  renderAISettings,
  storedSettings,
} from "../../../src/components/SetupAIAssistant/test/setupHarness"

import React from "react"
import { act, fireEvent, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { expect, it } from "vitest"
import { SetupAIAssistant } from "../../../src/components/SetupAIAssistant"
import type { AiAssistantSettings } from "../../../src/providers/LocalStorageProvider/types"
import { AIChatButton } from "../../../src/scenes/Layout/AIChatButton"
import { LocalAgentChatLauncher } from "../../../src/scenes/Layout/LocalAgentChatLauncher"
import { LocalAgentContext } from "../../../src/utils/localAgent/LocalAgentContext"
import type {
  LocalAgentChannel,
  LocalAgentSnapshot,
} from "../../../src/utils/localAgent/localAgentChannel"
import { LOCAL_AGENT_MODEL } from "../../../src/utils/localAgent/localAgentModel"
import { emitLocalAgentPairedViaLink } from "../../../src/utils/localAgent/localAgentPairing"

const agent: LocalAgentSnapshot = {
  info: { id: "fixture", label: "Test local agent", cwd: "/tmp" },
  state: "ready",
  error: null,
  config: null,
  questions: [],
  commands: [],
  acceptsImages: false,
}

const agentChannel = {
  getSnapshot: () => agent,
  subscribe: () => () => undefined,
  isTransportReady: () => true,
} as unknown as LocalAgentChannel

const openAI = (
  enabledModels: string[],
  apiKey = "test-openai-key",
): AiAssistantSettings["providers"] => ({
  openai: { apiKey, enabledModels, grantSchemaAccess: false },
})

// The agent selected while it is offline in this tab, with the API model
// that answers meanwhile.
const agentSelected = (
  providers: AiAssistantSettings["providers"],
  apiModel?: string,
): AiAssistantSettings => ({
  modelValueFormat: 2,
  selectedModel: LOCAL_AGENT_MODEL,
  providers,
  ...(apiModel && { localAgent: { apiModel } }),
})

const apiModelSelected = (
  providers: AiAssistantSettings["providers"],
): AiAssistantSettings => ({
  modelValueFormat: 2,
  selectedModel: "openai:gpt-5.4",
  providers,
})

const modelCheckbox = (prefix: string, id: string) => {
  const row = getAllByHook(`${prefix}-model-row`).find((element) =>
    Array.from(element.querySelectorAll("span")).some(
      (span) => span.textContent === id,
    ),
  )
  if (!row) throw new Error(`Missing model row: ${id}`)
  return within(row).getByRole("checkbox")
}

const waitForModelRows = (prefix: string) =>
  waitFor(() =>
    expect(getAllByHook(`${prefix}-model-row`).length).toBeGreaterThan(0),
  )

const pickModel = async (label: string) => {
  await openModelPicker()
  const option = getAllByHook("chat-model-picker-option").find((item) =>
    item.textContent?.includes(label),
  )
  if (!option) throw new Error(`Missing model option: ${label}`)
  await userEvent.click(option)
}

// What a writer of selectedModel decides: the selected model, and the API
// model that answers while the agent is selected and offline.
type ModelChoice = { selectedModel?: string; apiModel?: string }

const modelChoiceOf = (settings: AiAssistantSettings): ModelChoice => ({
  selectedModel: settings.selectedModel,
  apiModel: settings.localAgent?.apiModel,
})

const customProviderId = () =>
  Object.keys(storedSettings().customProviders ?? {})[0]

// Every writer of selectedModel. Only choosing an API model in the model
// picker replaces the agent's marker; every other writer of an API model
// keeps the agent selected and stores the model in localAgent.apiModel, the
// model that answers while the agent is offline. The writers that select the
// agent keep the API model selected before it.
const writers: {
  writer: string
  settings: AiAssistantSettings
  agentOnline: boolean
  listing?: string[]
  write: () => Promise<unknown> | void
  expected: () => ModelChoice
}[] = [
  {
    writer: "the setup wizard's API key (ConfigurationModal)",
    settings: agentSelected({}),
    agentOnline: false,
    write: async () => {
      await openConfiguration()
      await userEvent.click(getByHook("ai-settings-provider-openai"))
      await userEvent.type(getByHook("ai-settings-api-key"), "test-key")
      await userEvent.click(getByHook("multi-step-modal-next-button"))
      await waitForModelRows("configure-models")
      await userEvent.click(modelCheckbox("configure-models", "gpt-5.4"))
      await userEvent.click(getByHook("multi-step-modal-next-button"))
    },
    expected: () => ({
      selectedModel: LOCAL_AGENT_MODEL,
      apiModel: "openai:gpt-5.4",
    }),
  },
  {
    writer: "the setup wizard's custom provider (ConfigurationModal)",
    settings: agentSelected({}),
    agentOnline: false,
    listing: ["llama3"],
    write: async () => {
      await openConfiguration()
      await userEvent.click(getByHook("ai-settings-provider-custom"))
      fireEvent.change(getByHook("custom-provider-name-input"), {
        target: { value: "Ollama" },
      })
      fireEvent.change(getByHook("custom-provider-base-url-input"), {
        target: { value: "https://local.example/v1" },
      })
      await userEvent.click(getByHook("multi-step-modal-next-button"))
      await waitFor(() =>
        expect(getAllByHook("custom-provider-model-row")).toHaveLength(1),
      )
      await userEvent.click(getByHook("custom-provider-model-row"))
      await userEvent.click(getByHook("multi-step-modal-next-button"))
      await waitFor(() => expect(customProviderId()).toBeDefined())
    },
    expected: () => ({
      selectedModel: LOCAL_AGENT_MODEL,
      apiModel: `${customProviderId()}:llama3`,
    }),
  },
  {
    writer: "Save Settings, the API model no longer enabled (SettingsModal)",
    settings: agentSelected(openAI(["openai:gpt-5.4"]), "openai:gpt-5"),
    agentOnline: false,
    write: async () => {
      await openSettings()
      await userEvent.click(getByHook("ai-settings-save"))
    },
    expected: () => ({
      selectedModel: LOCAL_AGENT_MODEL,
      apiModel: "openai:gpt-5.4",
    }),
  },
  {
    writer: "Save Settings once the only provider is reset (SettingsModal)",
    settings: agentSelected(openAI(["openai:gpt-5.4"]), "openai:gpt-5.4"),
    agentOnline: false,
    write: async () => {
      await openSettings()
      await userEvent.click(getByHook("ai-settings-remove-provider"))
      await userEvent.click(getByHook("ai-settings-save"))
    },
    expected: () => ({ selectedModel: LOCAL_AGENT_MODEL, apiModel: undefined }),
  },
  {
    writer: "Manage models (SettingsModal)",
    settings: agentSelected(openAI(["openai:gpt-5.4"]), "openai:gpt-5.4"),
    agentOnline: false,
    write: async () => {
      await openSettings()
      await userEvent.click(getByHook("ai-settings-manage-models"))
      await waitForModelRows("manage-models")
      await userEvent.click(modelCheckbox("manage-models", "gpt-5.4"))
      await userEvent.click(modelCheckbox("manage-models", "gpt-5-mini"))
      await userEvent.click(getByHook("manage-models-save"))
    },
    expected: () => ({
      selectedModel: LOCAL_AGENT_MODEL,
      apiModel: "openai:gpt-5-mini",
    }),
  },
  {
    writer: "an API model chosen in the model picker (useComposerModel)",
    settings: agentSelected(
      openAI(["openai:gpt-5.4", "openai:gpt-5-mini"]),
      "openai:gpt-5.4",
    ),
    agentOnline: false,
    write: () => pickModel("GPT 5 Mini"),
    expected: () => ({
      selectedModel: "openai:gpt-5-mini",
      apiModel: "openai:gpt-5.4",
    }),
  },
  {
    writer: "the agent chosen in the model picker (useComposerModel)",
    settings: apiModelSelected(openAI(["openai:gpt-5.4"])),
    agentOnline: true,
    write: () => pickModel("Default model"),
    expected: () => ({
      selectedModel: LOCAL_AGENT_MODEL,
      apiModel: "openai:gpt-5.4",
    }),
  },
  {
    writer: "the chat button with no usable API model (AIChatButton)",
    settings: apiModelSelected(openAI(["openai:gpt-5.4"], "")),
    agentOnline: true,
    write: () => userEvent.click(getByHook("ai-chat-button")),
    expected: () => ({
      selectedModel: LOCAL_AGENT_MODEL,
      apiModel: "openai:gpt-5.4",
    }),
  },
  {
    writer: "an accepted pairing link (LocalAgentChatLauncher)",
    settings: apiModelSelected(openAI(["openai:gpt-5.4"])),
    agentOnline: true,
    write: () => act(() => emitLocalAgentPairedViaLink()),
    expected: () => ({
      selectedModel: LOCAL_AGENT_MODEL,
      apiModel: "openai:gpt-5.4",
    }),
  },
]

it.each(writers.map((row) => [row.writer, row] as const))(
  "%s keeps the agent's selection rule",
  async (_writer, { settings, agentOnline, listing, write, expected }) => {
    // Given
    const server = modelServer()
    if (listing) {
      server.reply = () =>
        Response.json({
          object: "list",
          data: listing.map((id) => ({ id, object: "model" })),
        })
    }
    renderAISettings(
      <LocalAgentContext.Provider value={agentOnline ? agentChannel : null}>
        <SetupAIAssistant />
        <AIChatButton />
        <ChatModelControls />
        <LocalAgentChatLauncher />
      </LocalAgentContext.Provider>,
      settings,
    )

    // When
    await write()

    // Then
    await waitFor(() =>
      expect(modelChoiceOf(storedSettings())).toEqual(expected()),
    )
  },
)
