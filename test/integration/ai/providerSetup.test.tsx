// @vitest-environment jsdom

import {
  renderAISettings,
  getByHook,
  queryByHook,
  openConfiguration,
  modelServer,
  OPENAI_LISTING,
  ANTHROPIC_LISTING,
  configuredOpenAI,
  storedSettings,
  getAllByHook,
  openSettings,
  deferredResponse,
} from "../../../src/components/SetupAIAssistant/test/setupHarness"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { expect, it } from "vitest"

const checkbox = (id: string, prefix = "manage-models") => {
  const row = getAllByHook(`${prefix}-model-row`).find(
    (element) =>
      element.textContent === id ||
      Array.from(element.querySelectorAll("span")).some(
        (span) => span.textContent === id,
      ),
  )
  if (!row) throw new Error(`Missing model row: ${id}`)
  return within(row).getByRole("checkbox")
}
const waitForModels = async (prefix = "manage-models", count = 5) => {
  await waitFor(() =>
    expect(getAllByHook(`${prefix}-model-row`)).toHaveLength(count),
  )
}
const enterWizardKey = async (provider = "openai") => {
  await openConfiguration()
  await userEvent.click(getByHook(`ai-settings-provider-${provider}`))
  await userEvent.type(getByHook("ai-settings-api-key"), "test-key")
  await userEvent.click(getByHook("multi-step-modal-next-button"))
}
const editKey = async (key: string) => {
  await userEvent.click(getByHook("ai-settings-edit-api-key"))
  expect(getByHook("ai-settings-api-key")).not.toHaveAttribute("readonly")
  await userEvent.clear(getByHook("ai-settings-api-key"))
  await userEvent.type(getByHook("ai-settings-api-key"), key)
}

it("opens the promo, closes it with the same control, and continues to setup", async () => {
  // Given
  modelServer()
  renderAISettings()

  // When
  await userEvent.click(getByHook("ai-assistant-settings-button"))
  await waitFor(() => expect(getByHook("ai-promo-modal")).toBeVisible())
  await userEvent.click(getByHook("ai-assistant-settings-button"))

  // Then
  expect(queryByHook("ai-promo-modal")).not.toBeInTheDocument()
  expect(queryByHook("ai-settings-modal-step-one")).not.toBeInTheDocument()

  // When
  await userEvent.click(getByHook("ai-assistant-settings-button"))
  await userEvent.click(getByHook("ai-promo-close"))

  // Then
  expect(queryByHook("ai-promo-modal")).not.toBeInTheDocument()

  // When
  await openConfiguration()

  // Then
  expect(getByHook("ai-settings-modal-step-one")).toBeVisible()
})

it("preserves delisted and manual models, removes only the chosen chip, and reloads saved labels", async () => {
  // Given
  modelServer()
  const view = renderAISettings(undefined, {
    selectedModel: "gpt-5.4",
    providers: {
      openai: {
        apiKey: "test-openai-key",
        enabledModels: ["gpt-5.4", "gpt-5.4-2026-03-05", "my-proxy-model"],
        grantSchemaAccess: false,
      },
    },
  })

  // When
  await openSettings()
  await userEvent.click(getByHook("ai-settings-manage-models"))
  await waitForModels()

  // Then
  expect(checkbox("gpt-5.4")).toBeChecked()
  expect(
    getAllByHook("manage-models-model-chip").map((chip) => chip.textContent),
  ).toEqual(["gpt-5.4-2026-03-05", "my-proxy-model"])

  // When
  await userEvent.click(checkbox("gpt-5"))
  expect(checkbox("gpt-5-2025-08-06")).not.toBeChecked()
  await userEvent.click(
    screen.getByRole("button", { name: "Remove gpt-5.4-2026-03-05" }),
  )
  await userEvent.click(getByHook("manage-models-save"))
  await userEvent.click(getByHook("ai-settings-cancel"))
  view.unmount()
  renderAISettings()
  await userEvent.click(getByHook("ai-settings-model-dropdown"))

  // Then
  expect(storedSettings().providers?.openai?.enabledModels).toEqual([
    "openai:gpt-5.4",
    "openai:my-proxy-model",
    "openai:gpt-5",
  ])
  const labels = getAllByHook("ai-settings-model-item-label").map(
    (item) => item.textContent,
  )
  expect(labels).toContain("GPT 5.4")
  expect(labels).toContain("my-proxy-model")
  expect(labels).not.toContain("My-proxy-model")
})

it("locks the model picker when the provider rate-limits listing without changing saved models", async () => {
  // Given
  const server = modelServer()
  server.reply = () =>
    Response.json(
      {
        error: {
          message: "Rate limit reached",
          type: "rate_limit_error",
          param: null,
          code: "rate_limit_exceeded",
        },
      },
      { status: 429, headers: { "retry-after-ms": "1" } },
    )
  renderAISettings(undefined, configuredOpenAI)

  // When
  await openSettings()
  await userEvent.click(getByHook("ai-settings-manage-models"))

  // Then
  await waitFor(() =>
    expect(getByHook("manage-models-fetch-error")).toHaveTextContent(
      "rate or usage limit was reached",
    ),
  )
  expect(queryByHook("manage-models-model-row")).not.toBeInTheDocument()
  expect(
    queryByHook("manage-models-manual-model-input"),
  ).not.toBeInTheDocument()
  expect(getByHook("manage-models-save")).toBeDisabled()
  expect(storedSettings().providers?.openai?.enabledModels).toEqual([
    "openai:gpt-5.4",
  ])
})

it("discards wizard validation after Escape and reopens at an empty first step", async () => {
  // Given
  const server = modelServer()
  const response = deferredResponse()
  server.reply = () => response.promise
  renderAISettings()
  await enterWizardKey()
  await waitFor(() => expect(server.requests).toHaveLength(1))

  // When
  await userEvent.keyboard("{Escape}")
  await response.respond(Response.json(OPENAI_LISTING))
  await openConfiguration()

  // Then
  expect(getByHook("ai-settings-modal-step-one")).toBeVisible()
  expect(queryByHook("ai-settings-modal-step-two")).not.toBeInTheDocument()
  expect(queryByHook("ai-settings-api-key")).not.toBeInTheDocument()
})

it("discards validation after a provider switch, then saves a fresh validation to the correct provider", async () => {
  // Given
  const server = modelServer()
  const response = deferredResponse()
  server.reply = () => response.promise
  renderAISettings(undefined, configuredOpenAI)
  await openSettings("anthropic")
  await userEvent.type(getByHook("ai-settings-api-key"), "anthropic-key")
  await userEvent.click(getByHook("ai-settings-test-api"))
  await waitFor(() => expect(server.requests).toHaveLength(1))

  // When
  await userEvent.click(getByHook("ai-settings-provider-openai"))
  await response.respond(Response.json(ANTHROPIC_LISTING))
  await userEvent.click(getByHook("ai-settings-provider-anthropic"))

  // Then
  expect(queryByHook("manage-models-save")).not.toBeInTheDocument()
  expect(getByHook("ai-settings-test-api")).toBeEnabled()

  // When
  server.reply = () => Response.json(ANTHROPIC_LISTING)
  await userEvent.click(getByHook("ai-settings-test-api"))
  await waitForModels("manage-models", 3)
  await userEvent.click(checkbox("claude-haiku-4-5"))
  await userEvent.click(getByHook("manage-models-save"))

  // Then
  expect(storedSettings().providers?.anthropic?.enabledModels).toEqual([
    "anthropic:claude-haiku-4-5",
  ])
  expect(storedSettings().providers?.openai).toEqual(
    configuredOpenAI.providers?.openai,
  )
})

it("discards a validation response when its key was edited while the request was pending", async () => {
  // Given
  const server = modelServer()
  const response = deferredResponse()
  server.reply = () => response.promise
  renderAISettings(undefined, configuredOpenAI)
  await openSettings()
  await editKey("key-a")
  await userEvent.click(getByHook("ai-settings-test-api"))
  await waitFor(() => expect(server.requests).toHaveLength(1))

  // When
  await editKey("key-b-changed")
  await response.respond(Response.json(OPENAI_LISTING))

  // Then
  expect(queryByHook("ai-settings-validated-badge")).not.toBeInTheDocument()
  expect(queryByHook("manage-models-save")).not.toBeInTheDocument()
  expect(getByHook("ai-settings-test-api")).toBeEnabled()
  expect(storedSettings().providers?.openai?.apiKey).toBe("test-openai-key")
})

it.each(["openai", "anthropic"])(
  "shows %s authentication errors and lets the user retry",
  async (provider) => {
    // Given
    const server = modelServer()
    const response = deferredResponse()
    server.reply = () => response.promise
    renderAISettings()
    await openConfiguration()
    expect(queryByHook("ai-settings-api-key")).not.toBeInTheDocument()
    await userEvent.click(getByHook("ai-settings-provider-anthropic"))
    expect(getByHook("ai-settings-api-key")).toHaveAttribute(
      "placeholder",
      "Enter Anthropic API key",
    )
    await userEvent.type(getByHook("ai-settings-api-key"), "discard-this-key")
    await userEvent.click(getByHook("ai-settings-provider-openai"))
    expect(getByHook("ai-settings-api-key")).toHaveAttribute(
      "placeholder",
      "Enter OpenAI API key",
    )
    expect(getByHook("ai-settings-api-key")).toHaveValue("")

    // When
    await userEvent.click(getByHook(`ai-settings-provider-${provider}`))
    await userEvent.type(getByHook("ai-settings-api-key"), "invalid-key")
    await userEvent.click(getByHook("multi-step-modal-next-button"))

    // Then
    expect(getByHook("multi-step-modal-next-button")).toBeDisabled()
    expect(getByHook("multi-step-modal-next-button")).toHaveTextContent(
      "Validating...",
    )

    // When
    await response.respond(
      Response.json(
        provider === "openai"
          ? {
              error: {
                message: "Incorrect API key provided",
                type: "invalid_request_error",
                code: "invalid_api_key",
              },
            }
          : {
              type: "error",
              error: {
                type: "authentication_error",
                message: "invalid x-api-key",
              },
              request_id: "req_mock_test",
            },
        { status: 401 },
      ),
    )

    // Then
    await waitFor(() =>
      expect(getByHook("ai-settings-api-key-error")).toBeVisible(),
    )
    expect(getByHook("ai-settings-modal-step-one")).toBeVisible()
    expect(queryByHook("ai-settings-modal-step-two")).not.toBeInTheDocument()
    expect(getByHook("multi-step-modal-next-button")).toBeEnabled()
  },
)

it("activates two listed models with no data access, switches them, then removes the provider and AI controls", async () => {
  // Given
  const server = modelServer()
  server.reply = () =>
    Response.json({
      ...OPENAI_LISTING,
      data: OPENAI_LISTING.data.filter(
        (model) => model.id !== "gpt-5-2025-08-06",
      ),
    })
  renderAISettings()

  // When
  await enterWizardKey()
  await waitForModels("configure-models", 4)
  expect(
    getAllByHook("configure-models-model-row").every(
      (row) => !within(row).getByRole<HTMLInputElement>("checkbox").checked,
    ),
  ).toBe(true)
  await userEvent.click(checkbox("gpt-5.4", "configure-models"))
  await userEvent.click(checkbox("gpt-5-mini", "configure-models"))
  expect(getByHook("permissions-trigger")).toHaveTextContent("Schema access")
  await userEvent.click(getByHook("permissions-trigger"))
  await userEvent.click(getByHook("permission-level-none"))
  expect(getByHook("permissions-trigger")).toHaveTextContent("None")
  await userEvent.click(getByHook("multi-step-modal-next-button"))

  // Then
  expect(storedSettings().providers?.openai).toMatchObject({
    grantSchemaAccess: false,
    read: false,
    write: false,
  })
  expect(getByHook("ai-assistant-settings-button")).toHaveTextContent(
    "AI Settings",
  )
  expect(getByHook("ai-chat-button")).toBeVisible()
  expect(getByHook("ai-settings-model-dropdown")).toBeVisible()

  // When
  for (const label of ["GPT 5 Mini", "GPT 5.4"]) {
    await userEvent.click(getByHook("ai-settings-model-dropdown"))
    const item = getAllByHook("ai-settings-model-item").find((item) =>
      item.textContent?.includes(label),
    )!
    await userEvent.click(item)
    expect(getByHook("ai-settings-model-dropdown")).toHaveTextContent(label)
    expect(queryByHook("ai-settings-model-item")).not.toBeInTheDocument()
  }
  await openSettings()

  // Then
  expect(getByHook("ai-settings-validated-badge")).toHaveTextContent(
    "Validated",
  )
  expect(
    within(getByHook("ai-settings-provider-openai")).getByText("Enabled"),
  ).toBeVisible()
  expect(
    within(getByHook("ai-settings-provider-anthropic")).getByText("Inactive"),
  ).toBeVisible()

  // When
  await userEvent.click(getByHook("ai-settings-remove-provider"))
  expect(queryByHook("ai-settings-validated-badge")).not.toBeInTheDocument()
  expect(
    within(getByHook("ai-settings-provider-openai")).getByText("Inactive"),
  ).toBeVisible()
  await userEvent.click(getByHook("ai-settings-save"))

  // Then
  expect(queryByHook("ai-settings-model-dropdown")).not.toBeInTheDocument()
  expect(queryByHook("ai-chat-button")).not.toBeInTheDocument()
  expect(getByHook("ai-assistant-settings-button")).toHaveTextContent(
    "Configure",
  )
  expect(storedSettings().providers?.openai).toBeUndefined()
})

it("reuses validation listing, cancels a first provider, and saves Select All in listing order", async () => {
  // Given
  const server = modelServer()
  renderAISettings(undefined, {
    modelValueFormat: 2,
    selectedModel: "anthropic:claude-haiku-4-5",
    providers: {
      anthropic: {
        apiKey: "anthropic-key",
        enabledModels: ["anthropic:claude-haiku-4-5"],
        grantSchemaAccess: false,
      },
    },
  })
  await openSettings()
  await userEvent.type(getByHook("ai-settings-api-key"), "key-one")

  // When
  await userEvent.click(getByHook("ai-settings-test-api"))
  await waitForModels()

  // Then
  expect(server.requests).toHaveLength(1)
  expect(
    getAllByHook("manage-models-model-row").map((row) => row.textContent),
  ).toEqual([
    "GPT 5.4gpt-5.4",
    "GPT 5 Minigpt-5-mini",
    "GPT 5gpt-5",
    "GPT 5 (2025-08-06)gpt-5-2025-08-06",
    "GPT 5 Nanogpt-5-nano",
  ])

  // When
  await userEvent.click(getByHook("manage-models-cancel"))

  // Then
  expect(queryByHook("ai-settings-validated-badge")).not.toBeInTheDocument()
  expect(getByHook("ai-settings-test-api")).toBeEnabled()
  expect(storedSettings().providers?.openai).toBeUndefined()

  // When
  await userEvent.click(getByHook("ai-settings-test-api"))
  await waitForModels()
  await userEvent.click(getByHook("manage-models-select-all"))
  await userEvent.click(getByHook("manage-models-save"))

  // Then
  expect(server.requests).toHaveLength(2)
  expect(storedSettings().providers?.openai?.enabledModels).toEqual([
    "openai:gpt-5.4",
    "openai:gpt-5-mini",
    "openai:gpt-5",
    "openai:gpt-5-2025-08-06",
    "openai:gpt-5-nano",
  ])
})

it("clears old model choices for a changed key and restores the key, labels and utility model on Cancel", async () => {
  // Given
  modelServer()
  const settings = {
    ...configuredOpenAI,
    providers: {
      openai: {
        ...configuredOpenAI.providers.openai,
        modelLabels: { "gpt-5.4": "My saved label" },
        utilityModel: "openai:gpt-5-nano",
      },
    },
  }
  renderAISettings(undefined, settings)
  await openSettings()

  // When
  await editKey("key-two")
  await userEvent.click(getByHook("ai-settings-test-api"))
  await waitForModels()

  // Then
  expect(
    getAllByHook("manage-models-model-row").every(
      (row) => !within(row).getByRole<HTMLInputElement>("checkbox").checked,
    ),
  ).toBe(true)

  // When
  await userEvent.click(getByHook("manage-models-cancel"))
  expect(getByHook("ai-settings-validated-badge")).toHaveTextContent(
    "Validated",
  )
  await userEvent.click(getByHook("ai-settings-edit-api-key"))
  expect(getByHook("ai-settings-api-key")).toHaveValue("test-openai-key")
  await userEvent.click(getByHook("ai-settings-save"))

  // Then
  expect(storedSettings().providers?.openai).toMatchObject(
    settings.providers.openai,
  )
})
