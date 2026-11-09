// @vitest-environment jsdom

import {
  getAllByHook,
  getByHook,
  modelServer,
  openConfiguration,
  openSettings,
  queryByHook,
  renderAISettings,
  storedSettings,
} from "../../../src/components/SetupAIAssistant/test/setupHarness"

import React from "react"
import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { SetupAIAssistant } from "../../../src/components/SetupAIAssistant"
import { ModelDropdown } from "../../../src/components/SetupAIAssistant/ModelDropdown"
import type { AiAssistantSettings } from "../../../src/providers/LocalStorageProvider/types"

const click = (hook: string) => userEvent.click(getByHook(hook))
const fill = (hook: string, value: string) => {
  fireEvent.change(getByHook(hook), { target: { value } })
}
const listing = (models: string[]) =>
  Response.json({
    object: "list",
    data: models.map((id) => ({ id, object: "model" })),
  })
const failedListing = () =>
  Response.json(
    { error: "Model listing unavailable" },
    { status: 500, headers: { "retry-after-ms": "1" } },
  )
const configuredCustom = (
  models = ["llama3", "mistral", "codellama"],
): AiAssistantSettings => ({
  modelValueFormat: 2,
  selectedModel: `local:${models[0]}`,
  customProviders: {
    local: {
      type: "openai-chat-completions",
      name: "My Provider",
      baseURL: "https://local.example/v1",
      contextWindow: 200000,
      models,
      grantSchemaAccess: true,
    },
  },
  providers: {
    local: {
      apiKey: "",
      enabledModels: models.map((model) => `local:${model}`),
      grantSchemaAccess: true,
    },
  },
})
const mountSettings = (settings?: AiAssistantSettings) =>
  renderAISettings(
    <>
      <SetupAIAssistant />
      <ModelDropdown />
    </>,
    settings,
  )
const expectDropdownModels = async (models: string[]) => {
  await click("ai-settings-model-dropdown")
  expect(
    getAllByHook("ai-settings-model-item").map((item) => item.textContent),
  ).toEqual(models)
  await userEvent.keyboard("{Escape}")
}

describe("custom provider setup", () => {
  it("blocks invalid connection and model values, then saves the corrected provider", async () => {
    // Given
    const server = modelServer()
    server.reply = failedListing
    mountSettings()
    await openConfiguration()
    await click("ai-settings-provider-custom")
    expect(getByHook("multi-step-modal-next-button")).toBeDisabled()

    // When
    fill("custom-provider-name-input", "OpenRouter")
    fill("custom-provider-base-url-input", "ftp://invalid")
    await click("multi-step-modal-next-button")

    // Then
    expect(
      screen.getByText("Base URL must start with http:// or https://"),
    ).toBeVisible()
    expect(server.requests).toHaveLength(0)

    // When
    fill("custom-provider-base-url-input", "https://openrouter.example/api/v1")
    fill("custom-provider-api-key-input", "sk-test")
    await click("multi-step-modal-next-button")
    await waitFor(() =>
      expect(getByHook("custom-provider-warning-banner")).toBeVisible(),
    )
    expect(server.requests.map((request) => request.url)).toContain(
      "https://openrouter.example/api/v1/models",
    )
    await click("multi-step-modal-next-button")

    // Then
    expect(screen.getByText("Add at least one model")).toBeVisible()
    expect(storedSettings().customProviders).toBeUndefined()

    // When
    await userEvent.type(
      getByHook("custom-provider-manual-model-input"),
      "gpt-4o{Enter}",
    )
    fill("custom-provider-manual-model-input", "gpt-4o")
    await click("custom-provider-add-model-button")

    // Then
    expect(getAllByHook("custom-provider-model-chip")).toHaveLength(1)
    expect(getByHook("custom-provider-model-chip")).toHaveTextContent("gpt-4o")

    // When
    fill("custom-provider-manual-model-input", "claude-3.5-sonnet")
    await click("custom-provider-add-model-button")
    expect(getAllByHook("custom-provider-model-chip")).toHaveLength(2)
    expect(getByHook("custom-provider-add-model-button")).toBeDisabled()
    fill("custom-provider-context-window-input", "50000")
    await click("multi-step-modal-next-button")

    // Then
    expect(
      screen.getByText("Context window must be at least 100,000 tokens"),
    ).toBeVisible()
    expect(storedSettings().customProviders).toBeUndefined()

    // When
    fill("custom-provider-context-window-input", "100000")
    await click("multi-step-modal-next-button")

    // Then
    const definition = Object.values(storedSettings().customProviders!)[0]
    expect(definition).toMatchObject({
      name: "OpenRouter",
      baseURL: "https://openrouter.example/api/v1",
      apiKey: "sk-test",
      models: ["gpt-4o", "claude-3.5-sonnet"],
      contextWindow: 100000,
    })
    expect(
      screen.getByText("AI Assistant activated successfully"),
    ).toBeVisible()
    await expectDropdownModels(["gpt-4o", "claude-3.5-sonnet"])
  })

  it("selects listed models, clears them, and removes a temporary manual model before saving", async () => {
    // Given
    const server = modelServer()
    server.reply = () => listing(["llama3", "mistral", "codellama"])
    mountSettings()
    await openConfiguration()
    await click("ai-settings-provider-custom")
    fill("custom-provider-name-input", "Ollama")
    fill("custom-provider-base-url-input", "https://local.example/v1")
    await click("multi-step-modal-next-button")
    await waitFor(() =>
      expect(getAllByHook("custom-provider-model-row")).toHaveLength(3),
    )
    expect(getByHook("custom-provider-context-window-input")).toHaveValue(
      200000,
    )

    // When
    await click("custom-provider-select-all")

    // Then
    getAllByHook("custom-provider-model-row").forEach((row) =>
      expect(within(row).getByRole("checkbox")).toBeChecked(),
    )

    // When
    await click("custom-provider-deselect-all")

    // Then
    getAllByHook("custom-provider-model-row").forEach((row) =>
      expect(within(row).getByRole("checkbox")).not.toBeChecked(),
    )

    // When
    for (const model of ["llama3", "mistral"]) {
      await userEvent.click(
        getAllByHook("custom-provider-model-row").find(
          (row) => row.textContent === model,
        )!,
      )
    }
    fill("custom-provider-manual-model-input", "custom-finetune")
    await click("custom-provider-add-model-button")
    expect(getByHook("custom-provider-model-chip")).toHaveTextContent(
      "custom-finetune",
    )
    await click("custom-provider-remove-model")
    expect(queryByHook("custom-provider-model-chip")).not.toBeInTheDocument()
    await click("multi-step-modal-next-button")

    // Then
    expect(Object.values(storedSettings().customProviders!)[0].models).toEqual([
      "llama3",
      "mistral",
    ])
    await expectDropdownModels(["llama3", "mistral"])
  })

  it("rejects existing custom and built-in names, then saves a unique provider identity", async () => {
    // Given
    const server = modelServer()
    server.reply = failedListing
    mountSettings(configuredCustom(["test-model"]))
    await openSettings("local")
    await click("ai-settings-add-custom-provider")
    fill("custom-provider-base-url-input", "https://other.example/v1")

    // When / Then
    for (const name of ["My Provider", "openai"]) {
      fill("custom-provider-name-input", name)
      await click("multi-step-modal-next-button")
      expect(
        screen.getByText("A provider with the same name already exists"),
      ).toBeVisible()
      expect(server.requests).toHaveLength(0)
      expect(Object.keys(storedSettings().customProviders!)).toEqual(["local"])
    }

    // When
    fill("custom-provider-name-input", "My Provider (v2.0)!")
    await click("multi-step-modal-next-button")
    await waitFor(() =>
      expect(getByHook("custom-provider-warning-banner")).toBeVisible(),
    )
    expect(server.requests.map((request) => request.url)).toContain(
      "https://other.example/v1/models",
    )
    fill("custom-provider-manual-model-input", "test-model-2")
    await click("custom-provider-add-model-button")
    await click("multi-step-modal-next-button")

    // Then
    expect(getByHook("ai-settings-provider-local")).toHaveTextContent(
      "My Provider",
    )
    const providerId = Object.keys(storedSettings().customProviders!).find(
      (id) => id !== "local",
    )!
    expect(providerId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    )
    expect(getByHook(`ai-settings-provider-${providerId}`)).toHaveTextContent(
      "My Provider (v2.0)!",
    )
    await click("ai-settings-save")
    expect(storedSettings().customProviders![providerId]).toMatchObject({
      name: "My Provider (v2.0)!",
      models: ["test-model-2"],
    })
  })

  it("resets a cancelled setup but preserves connection fields when going back", async () => {
    // Given
    const server = modelServer()
    server.reply = failedListing
    mountSettings()
    await openConfiguration()
    await click("ai-settings-provider-custom")
    fill("custom-provider-name-input", "Partial")
    fill("custom-provider-base-url-input", "https://partial.example/v1")

    // When
    await click("multi-step-modal-cancel-button")
    await click("ai-settings-provider-custom")

    // Then
    expect(getByHook("custom-provider-name-input")).toHaveValue("")
    expect(getByHook("custom-provider-base-url-input")).toHaveValue("")

    // When
    fill("custom-provider-name-input", "Test Provider")
    fill("custom-provider-base-url-input", "https://test.example/v1")
    await click("multi-step-modal-next-button")
    await waitFor(() =>
      expect(getByHook("custom-provider-warning-banner")).toBeVisible(),
    )
    expect(server.requests.map((request) => request.url)).toContain(
      "https://test.example/v1/models",
    )

    // Then
    expect(getByHook("custom-provider-context-window-input")).toHaveValue(
      200000,
    )
    expect(getByHook("permissions-trigger")).toHaveTextContent("Schema access")
    expect(getByHook("custom-provider-add-model-button")).toBeDisabled()

    // When
    await userEvent.type(
      getByHook("custom-provider-manual-model-input"),
      "enter-model{Enter}",
    )

    // Then
    expect(getAllByHook("custom-provider-model-chip")).toHaveLength(1)
    expect(getByHook("custom-provider-model-chip")).toHaveTextContent(
      "enter-model",
    )
    expect(getByHook("custom-provider-manual-model-input")).toHaveValue("")

    // When
    await click("multi-step-modal-cancel-button")

    // Then
    expect(getByHook("custom-provider-name-input")).toHaveValue("Test Provider")
    expect(getByHook("custom-provider-base-url-input")).toHaveValue(
      "https://test.example/v1",
    )
    await click("multi-step-modal-next-button")
    await waitFor(() =>
      expect(getByHook("custom-provider-warning-banner")).toBeVisible(),
    )
    expect(server.requests.map((request) => request.url)).toContain(
      "https://test.example/v1/models",
    )
  })
})

describe("custom provider settings", () => {
  it("saves model changes and the context window through both dialogs to the dropdown", async () => {
    // Given
    const server = modelServer()
    server.reply = () => listing(["llama3", "mistral", "codellama"])
    mountSettings(configuredCustom())
    await openSettings("local")
    await click("ai-settings-manage-models")
    await waitFor(() =>
      expect(getAllByHook("custom-provider-model-row")).toHaveLength(3),
    )
    getAllByHook("custom-provider-model-row").forEach((row) =>
      expect(within(row).getByRole("checkbox")).toBeChecked(),
    )

    // When
    fill("custom-provider-manual-model-input", "custom-finetune")
    await click("custom-provider-add-model-button")
    expect(getByHook("custom-provider-model-chip")).toHaveTextContent(
      "custom-finetune",
    )
    await userEvent.click(
      getAllByHook("custom-provider-model-row").find((row) =>
        row.textContent?.includes("codellama"),
      )!,
    )
    fill("custom-provider-context-window-input", "50000")
    await click("manage-models-save")

    // Then
    expect(
      screen.getByText("Context window must be at least 100,000 tokens"),
    ).toBeVisible()
    expect(storedSettings().customProviders!.local.contextWindow).toBe(200000)

    // When
    fill("custom-provider-context-window-input", "150000")
    await click("manage-models-save")
    expect(getByHook("ai-settings-manage-models")).toBeVisible()
    await click("ai-settings-save")

    // Then
    expect(storedSettings().customProviders!.local).toMatchObject({
      models: ["llama3", "mistral", "custom-finetune"],
      contextWindow: 150000,
    })
    expect(storedSettings().providers.local!.enabledModels).toEqual([
      "local:llama3",
      "local:mistral",
      "local:custom-finetune",
    ])
    await expectDropdownModels(["llama3", "mistral", "custom-finetune"])
  })

  it("restores a previously removed model through settings and the shared dropdown", async () => {
    // Given
    const server = modelServer()
    server.reply = () => listing(["llama3", "mistral", "codellama"])
    mountSettings(configuredCustom())

    for (const enabled of [false, true]) {
      // When
      await openSettings("local")
      await click("ai-settings-manage-models")
      await waitFor(() =>
        expect(getAllByHook("custom-provider-model-row")).toHaveLength(3),
      )
      const row = getAllByHook("custom-provider-model-row").find(
        (row) => row.textContent === "mistral",
      )!
      if (enabled) expect(within(row).getByRole("checkbox")).not.toBeChecked()
      else expect(within(row).getByRole("checkbox")).toBeChecked()
      await userEvent.click(row)
      await click("manage-models-save")

      // Then
      expect(document.querySelector('[data-model="mistral"]') !== null).toBe(
        enabled,
      )

      // When
      await click("ai-settings-save")

      // Then
      const models = enabled
        ? ["llama3", "codellama", "mistral"]
        : ["llama3", "codellama"]
      expect(storedSettings().customProviders!.local.models).toEqual(models)
      expect(storedSettings().providers.local!.enabledModels).toEqual(
        models.map((model) => `local:${model}`),
      )
      await expectDropdownModels(models)
    }
  })

  it("preserves existing models when listing fails and saves manual additions and removals", async () => {
    // Given
    const server = modelServer()
    server.reply = failedListing
    mountSettings(configuredCustom(["model-a", "model-b", "model-c"]))
    await openSettings("local")
    for (const model of ["model-a", "model-b", "model-c"]) {
      expect(
        document.querySelector(`[data-model="${model}"]`),
      ).toBeInTheDocument()
    }
    await click("ai-settings-manage-models")
    await waitFor(() =>
      expect(getByHook("custom-provider-warning-banner")).toBeVisible(),
    )
    expect(server.requests.map((request) => request.url)).toContain(
      "https://local.example/v1/models",
    )
    expect(
      getAllByHook("custom-provider-model-chip").map(
        (chip) => chip.textContent,
      ),
    ).toEqual(["model-a", "model-b", "model-c"])

    // When
    fill("custom-provider-manual-model-input", "model-d")
    await click("custom-provider-add-model-button")
    expect(getAllByHook("custom-provider-model-chip")).toHaveLength(4)
    const removed = getAllByHook("custom-provider-model-chip").find(
      (chip) => chip.textContent === "model-b",
    )!
    await userEvent.click(within(removed).getByRole("button"))
    expect(getAllByHook("custom-provider-model-chip")).toHaveLength(3)
    await click("manage-models-save")

    // Then
    expect(
      document.querySelector('[data-model="model-b"]'),
    ).not.toBeInTheDocument()
    for (const model of ["model-a", "model-c", "model-d"]) {
      expect(
        document.querySelector(`[data-model="${model}"]`),
      ).toBeInTheDocument()
    }

    // When
    await click("ai-settings-save")

    // Then
    expect(storedSettings().customProviders!.local.models).toEqual([
      "model-a",
      "model-c",
      "model-d",
    ])
    expect(storedSettings().providers.local!.enabledModels).toEqual([
      "local:model-a",
      "local:model-c",
      "local:model-d",
    ])
    await expectDropdownModels(["model-a", "model-c", "model-d"])
  })

  it("validates and persists a new key for a keyless provider without changing its models", async () => {
    // Given
    const server = modelServer()
    server.reply = () => listing(["llama3", "mistral"])
    mountSettings(configuredCustom(["llama3", "mistral"]))
    await openSettings("local")
    expect(queryByHook("ai-settings-validated-badge")).not.toBeInTheDocument()
    expect(getByHook("ai-settings-api-key")).toHaveAttribute(
      "placeholder",
      "This provider does not have an API key",
    )
    expect(getByHook("permissions-trigger")).not.toBeDisabled()
    expect(getByHook("ai-settings-manage-models")).toBeVisible()
    for (const model of ["llama3", "mistral"]) {
      expect(
        document.querySelector(`[data-model="${model}"]`),
      ).toBeInTheDocument()
    }
    await click("ai-settings-provider-openai")
    expect(queryByHook("ai-settings-manage-models")).not.toBeInTheDocument()

    // When
    await click("ai-settings-provider-local")
    await click("ai-settings-edit-api-key")
    fill("ai-settings-api-key", "sk-custom-key-123")
    await click("ai-settings-test-api")
    await waitFor(() =>
      expect(getByHook("ai-settings-validated-badge")).toBeVisible(),
    )

    // Then
    expect(server.requests.at(-1)!.url).toBe("https://local.example/v1/models")
    expect(server.requests.at(-1)!.headers.get("authorization")).toBe(
      "Bearer sk-custom-key-123",
    )
    for (const model of ["llama3", "mistral"]) {
      expect(
        document.querySelector(`[data-model="${model}"]`),
      ).toBeInTheDocument()
    }

    // When
    await click("ai-settings-save")

    // Then
    expect(storedSettings().providers.local).toMatchObject({
      apiKey: "sk-custom-key-123",
      enabledModels: ["local:llama3", "local:mistral"],
    })
    expect(storedSettings().customProviders!.local.apiKey).toBe(
      "sk-custom-key-123",
    )
    await expectDropdownModels(["llama3", "mistral"])
    await openSettings("local")
    expect(getByHook("ai-settings-validated-badge")).toBeVisible()
    await click("ai-settings-edit-api-key")
    expect(getByHook("ai-settings-api-key")).toHaveValue("sk-custom-key-123")
  })
})
