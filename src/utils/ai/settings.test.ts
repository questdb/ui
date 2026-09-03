import { describe, it, expect } from "vitest"
import {
  reconcileSettings,
  getSelectedModel,
  getAiPermissions,
  getAllModelOptions,
  getNextModel,
  getUtilityModel,
  providerForModel,
} from "./settings"

import type { AiAssistantSettings } from "../../providers/LocalStorageProvider/types"

const makeSettings = (
  overrides: Partial<AiAssistantSettings> = {},
): AiAssistantSettings => ({
  providers: {},
  ...overrides,
})

describe("reconcileSettings", () => {
  it("keeps built-in model ids it does not recognize", () => {
    // Given enabled models that no fixed list knows about
    const settings = makeSettings({
      providers: {
        openai: {
          apiKey: "sk-test",
          enabledModels: ["gpt-7", "gpt-5-mini"],
          grantSchemaAccess: false,
        },
      },
    })
    // When settings reconcile
    const result = reconcileSettings(settings)
    // Then availability is the picker's job, not reconcile's
    expect(result.providers.openai!.enabledModels).toEqual([
      "gpt-7",
      "gpt-5-mini",
    ])
  })

  it("collapses legacy reasoning variants into plain ids", () => {
    const settings = makeSettings({
      providers: {
        openai: {
          apiKey: "sk-test",
          enabledModels: [
            "gpt-5.4@reasoning=high",
            "gpt-5.4@reasoning=medium",
            "gpt-5-mini",
          ],
          grantSchemaAccess: false,
        },
      },
    })
    const result = reconcileSettings(settings)
    expect(result.providers.openai!.enabledModels).toEqual([
      "gpt-5.4",
      "gpt-5-mini",
    ])
  })

  it("folds a selected high variant into reasoningEffort", () => {
    // Given a user who ran the high variant
    const settings = makeSettings({
      selectedModel: "gpt-5.4@reasoning=high",
      providers: {
        openai: {
          apiKey: "sk-test",
          enabledModels: ["gpt-5.4@reasoning=high", "gpt-5.4@reasoning=low"],
          grantSchemaAccess: false,
        },
      },
    })
    // When settings reconcile
    const result = reconcileSettings(settings)
    // Then the provider runs on High and the selection is the plain id
    expect(result.providers.openai!.reasoningEffort).toBe("high")
    expect(result.selectedModel).toBe("gpt-5.4")
  })

  it("migrates medium and low variant users to the provider default", () => {
    const settings = makeSettings({
      selectedModel: "gpt-5.4@reasoning=medium",
      providers: {
        openai: {
          apiKey: "sk-test",
          enabledModels: ["gpt-5.4@reasoning=medium", "gpt-5.4@reasoning=low"],
          grantSchemaAccess: false,
        },
      },
    })
    const result = reconcileSettings(settings)
    expect(result.providers.openai!.reasoningEffort).toBeUndefined()
    expect(result.selectedModel).toBe("gpt-5.4")
  })

  it("removes custom models missing from their provider definition", () => {
    const settings = makeSettings({
      customProviders: {
        "custom-1": {
          type: "openai-chat-completions",
          name: "Test",
          baseURL: "http://localhost:11434/v1",
          contextWindow: 100_000,
          models: ["llm-a"],
        },
      },
      providers: {
        "custom-1": {
          apiKey: "",
          enabledModels: ["custom-1:llm-a", "custom-1:llm-removed"],
          grantSchemaAccess: false,
        },
      },
    })
    const result = reconcileSettings(settings)
    expect(result.providers["custom-1"]!.enabledModels).toEqual([
      "custom-1:llm-a",
    ])
  })

  it("is idempotent", () => {
    const settings = makeSettings({
      selectedModel: "gpt-5.4@reasoning=high",
      providers: {
        anthropic: {
          apiKey: "sk-test",
          enabledModels: ["claude-sonnet-4-5"],
          grantSchemaAccess: true,
        },
        openai: {
          apiKey: "sk-test",
          enabledModels: ["gpt-5.4@reasoning=high", "gpt-5-mini"],
          grantSchemaAccess: false,
        },
      },
    })
    const once = reconcileSettings(settings)
    const twice = reconcileSettings(once)
    expect(twice).toEqual(once)
  })

  it("preserves unknown fields (forward compat)", () => {
    const settings = makeSettings({
      providers: {
        anthropic: {
          apiKey: "sk-test",
          enabledModels: ["claude-sonnet-4-5"],
          grantSchemaAccess: false,
        },
      },
    })
    const settingsWithFutureField = settings as unknown as Record<
      string,
      string
    >
    settingsWithFutureField.futureField = "preserved"
    const result = reconcileSettings(settings)
    expect((result as unknown as Record<string, string>).futureField).toBe(
      "preserved",
    )
  })

  it("repairs selectedModel when it is not enabled anywhere", () => {
    const settings = makeSettings({
      selectedModel: "removed-model",
      providers: {
        openai: {
          apiKey: "sk-test",
          enabledModels: ["gpt-5-mini"],
          grantSchemaAccess: false,
        },
      },
    })
    const result = reconcileSettings(settings)
    expect(result.selectedModel).toEqual("gpt-5-mini")
  })

  it("preserves selectedModel if it is in enabledModels", () => {
    const settings = makeSettings({
      selectedModel: "gpt-5-mini",
      providers: {
        openai: {
          apiKey: "sk-test",
          enabledModels: ["gpt-5-mini"],
          grantSchemaAccess: false,
        },
      },
    })
    const result = reconcileSettings(settings)
    expect(result.selectedModel).toBe("gpt-5-mini")
  })

  it("handles empty providers gracefully", () => {
    const settings = makeSettings({ providers: {} })
    const result = reconcileSettings(settings)
    expect(result.providers).toEqual({})
  })

  it("does not mutate the input settings", () => {
    const settings = makeSettings({
      providers: {
        openai: {
          apiKey: "sk-test",
          enabledModels: ["gpt-5-mini", "gpt-5.4@reasoning=high"],
          grantSchemaAccess: false,
        },
      },
    })
    const originalModels = [...settings.providers.openai!.enabledModels]
    reconcileSettings(settings)
    expect(settings.providers.openai!.enabledModels).toEqual(originalModels)
  })
})

describe("getSelectedModel", () => {
  it("returns selectedModel when it is in enabledModels", () => {
    const settings = makeSettings({
      selectedModel: "gpt-5-mini",
      providers: {
        openai: {
          apiKey: "sk-test",
          enabledModels: ["gpt-5-mini", "gpt-5"],
          grantSchemaAccess: false,
        },
      },
    })
    expect(getSelectedModel(settings)).toBe("gpt-5-mini")
  })

  it("falls back to the first enabled model", () => {
    const settings = makeSettings({
      selectedModel: "claude-sonnet-4-5",
      providers: {
        openai: {
          apiKey: "sk-test",
          enabledModels: ["gpt-5-mini"],
          grantSchemaAccess: false,
        },
      },
    })
    expect(getSelectedModel(settings)).toBe("gpt-5-mini")
  })

  it("returns null when no models are enabled", () => {
    const settings = makeSettings({ providers: {} })
    expect(getSelectedModel(settings)).toBeNull()
  })
})

describe("getAllModelOptions", () => {
  it("builds options from enabled models with stored labels", () => {
    // Given a provider with one stored label and one without
    const settings = makeSettings({
      providers: {
        openai: {
          apiKey: "sk-test",
          enabledModels: ["gpt-5.4", "gpt-5-mini"],
          grantSchemaAccess: false,
          modelLabels: { "gpt-5.4": "GPT-5.4 (Custom)" },
        },
      },
    })
    // When options build
    const options = getAllModelOptions(settings)
    // Then the stored label wins and the formatter fills the gap
    expect(options).toEqual([
      { label: "GPT-5.4 (Custom)", value: "gpt-5.4", provider: "openai" },
      { label: "GPT-5 Mini", value: "gpt-5-mini", provider: "openai" },
    ])
  })

  it("includes namespaced custom provider models", () => {
    const settings = makeSettings({
      customProviders: {
        "custom-1": {
          type: "openai-chat-completions",
          name: "Test",
          baseURL: "http://localhost:11434/v1",
          contextWindow: 100_000,
          models: ["llm-a"],
        },
      },
    })
    expect(getAllModelOptions(settings)).toEqual([
      { label: "llm-a", value: "custom-1:llm-a", provider: "custom-1" },
    ])
  })
})

describe("providerForModel", () => {
  it("finds the built-in provider that enabled the model", () => {
    const settings = makeSettings({
      providers: {
        anthropic: {
          apiKey: "sk-test",
          enabledModels: ["claude-sonnet-5"],
          grantSchemaAccess: false,
        },
      },
    })
    expect(providerForModel("claude-sonnet-5", settings)).toBe("anthropic")
    expect(providerForModel("gpt-5-mini", settings)).toBeNull()
  })

  it("parses namespaced custom values without settings lookup", () => {
    expect(providerForModel("custom-1:llm-a")).toBe("custom-1")
  })
})

describe("getNextModel", () => {
  it("keeps the current model while it stays enabled", () => {
    expect(
      getNextModel("gpt-5-mini", { openai: ["gpt-5.4", "gpt-5-mini"] }),
    ).toBe("gpt-5-mini")
  })

  it("takes the first enabled model of any provider when the current one is gone", () => {
    const settings = makeSettings({
      providers: {
        anthropic: {
          apiKey: "sk-test",
          enabledModels: ["claude-sonnet-5"],
          grantSchemaAccess: false,
        },
      },
    })
    expect(
      getNextModel("gpt-5-mini", { anthropic: ["claude-sonnet-5"] }, settings),
    ).toBe("claude-sonnet-5")
  })

  it("returns null when nothing is enabled", () => {
    expect(getNextModel("gpt-5-mini", {})).toBeNull()
  })
})

describe("getUtilityModel", () => {
  it("returns the persisted utility model for a built-in provider", () => {
    const settings = makeSettings({
      selectedModel: "gpt-5.4",
      providers: {
        openai: {
          apiKey: "sk-test",
          enabledModels: ["gpt-5.4"],
          grantSchemaAccess: false,
          utilityModel: "gpt-5.6-luna",
        },
      },
    })
    expect(getUtilityModel("openai", settings)).toBe("gpt-5.6-luna")
  })

  it("falls back to the selected model when nothing is persisted", () => {
    const settings = makeSettings({
      selectedModel: "gpt-5.4",
      providers: {
        openai: {
          apiKey: "sk-test",
          enabledModels: ["gpt-5.4"],
          grantSchemaAccess: false,
        },
      },
    })
    expect(getUtilityModel("openai", settings)).toBe("gpt-5.4")
  })

  it("uses the selected model for custom providers", () => {
    const settings = makeSettings({
      selectedModel: "custom-1:llm-a",
      customProviders: {
        "custom-1": {
          type: "openai-chat-completions",
          name: "Test",
          baseURL: "http://localhost:11434/v1",
          contextWindow: 100_000,
          models: ["llm-a"],
        },
      },
    })
    expect(getUtilityModel("custom-1", settings)).toBe("custom-1:llm-a")
  })
})

describe("getAiPermissions", () => {
  it("returns all-false when no model is selected", () => {
    const settings = makeSettings()
    expect(getAiPermissions(settings)).toEqual({
      grantSchemaAccess: false,
      read: false,
      write: false,
    })
  })

  it("returns all-false when the selected model's provider has no settings", () => {
    const settings = makeSettings({
      selectedModel: "gpt-5-mini",
      providers: {},
    })
    expect(getAiPermissions(settings)).toEqual({
      grantSchemaAccess: false,
      read: false,
      write: false,
    })
  })

  it("defaults read/write to false when only the legacy grantSchemaAccess is persisted", () => {
    const settings = makeSettings({
      selectedModel: "gpt-5-mini",
      providers: {
        openai: {
          apiKey: "sk-test",
          enabledModels: ["gpt-5-mini"],
          grantSchemaAccess: true,
        },
      },
    })
    expect(getAiPermissions(settings)).toEqual({
      grantSchemaAccess: true,
      read: false,
      write: false,
    })
  })

  it("returns the three booleans verbatim when all are persisted on a built-in provider", () => {
    const settings = makeSettings({
      selectedModel: "gpt-5-mini",
      providers: {
        openai: {
          apiKey: "sk-test",
          enabledModels: ["gpt-5-mini"],
          grantSchemaAccess: true,
          read: true,
          write: true,
        },
      },
    })
    expect(getAiPermissions(settings)).toEqual({
      grantSchemaAccess: true,
      read: true,
      write: true,
    })
  })

  it("reads permissions from a custom provider definition", () => {
    const settings = makeSettings({
      selectedModel: "custom-1:llm-a",
      customProviders: {
        "custom-1": {
          type: "openai-chat-completions",
          name: "Test",
          baseURL: "http://localhost:11434/v1",
          contextWindow: 100_000,
          models: ["llm-a"],
          grantSchemaAccess: true,
          read: true,
          write: false,
        },
      },
      providers: {
        "custom-1": {
          apiKey: "",
          enabledModels: ["custom-1:llm-a"],
          grantSchemaAccess: true,
          read: true,
          write: false,
        },
      },
    })
    expect(getAiPermissions(settings)).toEqual({
      grantSchemaAccess: true,
      read: true,
      write: false,
    })
  })

  it("returns false for read when grantSchemaAccess is true but read is explicitly false", () => {
    const settings = makeSettings({
      selectedModel: "gpt-5-mini",
      providers: {
        openai: {
          apiKey: "sk-test",
          enabledModels: ["gpt-5-mini"],
          grantSchemaAccess: true,
          read: false,
          write: false,
        },
      },
    })
    expect(getAiPermissions(settings)).toEqual({
      grantSchemaAccess: true,
      read: false,
      write: false,
    })
  })
})
