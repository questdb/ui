// @vitest-environment jsdom
import {
  configuredOpenAI,
  getByHook,
  modelServer,
  queryByHook,
  renderAISettings,
  storedSettings,
} from "./test/setupHarness"
import { fireEvent, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import React, { useState } from "react"
import { describe, expect, it } from "vitest"
import { LocalAgentContext } from "../../utils/localAgent/LocalAgentContext"
import type {
  LocalAgentChannel,
  LocalAgentSnapshot,
} from "../../utils/localAgent/localAgentChannel"
import { LOCAL_AGENT_MODEL } from "../../utils/localAgent/localAgentModel"
import { Button } from "../Button"
import { SettingsModal } from "./SettingsModal"
import { EXPECTED_MCP_VERSION } from "../../utils/mcp/protocolVersion"

const pairedAgent: LocalAgentSnapshot = {
  info: { id: "fixture", label: "Test local agent", cwd: "/tmp" },
  state: "ready",
  error: null,
  config: null,
  questions: [],
  commands: [],
  acceptsImages: false,
}

const levels = [
  {
    level: "write",
    label: "Write",
    permissions: { grantSchemaAccess: true, read: true, write: true },
  },
  {
    level: "none",
    label: "None",
    permissions: { grantSchemaAccess: false, read: false, write: false },
  },
  {
    level: "read",
    label: "Read",
    permissions: { grantSchemaAccess: true, read: true, write: false },
  },
  {
    level: "schema",
    label: "Schema access",
    permissions: { grantSchemaAccess: true, read: false, write: false },
  },
]
const schemaPermissions = levels[3].permissions

const ReopenableSettings = () => {
  const [open, setOpen] = useState(true)
  return (
    <>
      <Button onClick={() => setOpen(true)}>Reopen settings</Button>
      {open && <SettingsModal open onOpenChange={setOpen} />}
    </>
  )
}

const selectPermission = async (level: string) => {
  await userEvent.click(getByHook("permissions-trigger"))
  await userEvent.click(getByHook(`permission-level-${level}`))
}

describe("AI permission settings", () => {
  it("saves permission scopes for the selected provider and restores them when reopened", async () => {
    // Given real settings with Schema access and a configured OpenAI provider
    modelServer()
    renderAISettings(<ReopenableSettings />, {
      ...configuredOpenAI,
      providers: {
        openai: {
          ...configuredOpenAI.providers.openai,
          ...schemaPermissions,
        },
      },
    })
    expect(getByHook("permissions-trigger")).toHaveTextContent("Schema access")

    // When the user saves Write, then None
    for (const choice of levels.slice(0, 2)) {
      await selectPermission(choice.level)
      expect(getByHook("permissions-trigger")).toHaveTextContent(choice.label)
      await userEvent.click(getByHook("ai-settings-save"))

      // Then storage contains the selected scopes and a new modal restores them
      await waitFor(() =>
        expect(storedSettings().providers?.openai).toMatchObject(
          choice.permissions,
        ),
      )
      await userEvent.click(
        screen.getByRole("button", { name: "Reopen settings" }),
      )
      expect(getByHook("permissions-trigger")).toHaveTextContent(choice.label)
    }

    // When the user cancels a Read draft
    await selectPermission("read")
    await userEvent.click(getByHook("ai-settings-cancel"))
    await userEvent.click(
      screen.getByRole("button", { name: "Reopen settings" }),
    )

    // Then the saved None permissions remain unchanged
    expect(storedSettings().providers?.openai).toMatchObject(
      levels[1].permissions,
    )
    expect(getByHook("permissions-trigger")).toHaveTextContent("None")
  })
})

it.each([configuredOpenAI.selectedModel, LOCAL_AGENT_MODEL])(
  "opens the saved provider from the Local Agent tab without changing the selected model (%s)",
  async (selectedModel) => {
    const server = modelServer()
    server.reply = () => Response.json({ data: [] })
    const channel = {
      getSnapshot: () => pairedAgent,
      subscribe: () => () => undefined,
      isTransportReady: () => true,
    } as unknown as LocalAgentChannel
    renderAISettings(
      <LocalAgentContext.Provider value={channel}>
        <SettingsModal open onOpenChange={() => undefined} />
      </LocalAgentContext.Provider>,
      { ...configuredOpenAI, selectedModel },
    )
    const user = userEvent.setup()
    if (selectedModel !== LOCAL_AGENT_MODEL) {
      await user.click(getByHook("ai-settings-provider-local-agent"))
    }
    expect(getByHook("ai-settings-local-agent")).toBeVisible()
    await user.click(getByHook("ai-settings-add-custom-provider"))

    fireEvent.change(getByHook("custom-provider-name-input"), {
      target: { value: "Custom Test Provider" },
    })
    fireEvent.change(getByHook("custom-provider-base-url-input"), {
      target: { value: "https://provider.example.invalid/v1" },
    })
    await user.click(getByHook("multi-step-modal-next-button"))
    await waitFor(() =>
      expect(getByHook("custom-provider-manual-model-input")).toBeVisible(),
    )
    fireEvent.change(getByHook("custom-provider-manual-model-input"), {
      target: { value: "test-model" },
    })
    await user.click(getByHook("custom-provider-add-model-button"))
    await user.click(screen.getByRole("button", { name: "Add Provider" }))

    expect(queryByHook("ai-settings-local-agent")).not.toBeInTheDocument()
    expect(getByHook("ai-settings-api-key")).toBeVisible()
    expect(screen.getByText("test-model")).toBeVisible()
    expect(storedSettings().selectedModel).toBe(selectedModel)
  },
)

describe("the coding agent tab", () => {
  it("offers to connect a coding agent before one is connected", async () => {
    // Given an assistant set up with an API key, and no coding agent
    modelServer()
    renderAISettings(
      <SettingsModal open onOpenChange={() => undefined} />,
      configuredOpenAI,
    )

    // When
    await userEvent.click(getByHook("ai-settings-provider-local-agent"))

    // Then
    expect(getByHook("ai-settings-provider-local-agent")).toHaveTextContent(
      "AgentNot connected",
    )
    expect(getByHook("ai-settings-connect-agent")).toHaveTextContent(
      `npx @questdb/mcp-server-questdb@${EXPECTED_MCP_VERSION} connect`,
    )
  })
})
