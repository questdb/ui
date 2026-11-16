import { describe, expect, it } from "vitest"
import {
  buildListingMetadata,
  getAiPermissions,
  getAllModelOptions,
  getNextModel,
  getSelectedModel,
  getUtilityModel,
  makeModelValue,
  parseModelValue,
  providerForModel,
  stripModelNamespace,
} from "./settings"

import {
  AI_MODEL_VALUE_FORMAT,
  type AiAssistantSettings,
} from "../../providers/LocalStorageProvider/types"

const makeSettings = (
  overrides: Partial<AiAssistantSettings> = {},
): AiAssistantSettings => ({
  providers: {},
  ...overrides,
})

describe("getSelectedModel", () => {
  it("returns selectedModel when it is in enabledModels", () => {
    const settings = makeSettings({
      selectedModel: "openai:gpt-5-mini",
      providers: {
        openai: {
          apiKey: "sk-test",
          enabledModels: ["openai:gpt-5-mini", "openai:gpt-5"],
          grantSchemaAccess: false,
        },
      },
    })
    expect(getSelectedModel(settings)).toBe("openai:gpt-5-mini")
  })

  it("falls back to the first enabled model", () => {
    const settings = makeSettings({
      selectedModel: "anthropic:claude-sonnet-4-5",
      providers: {
        openai: {
          apiKey: "sk-test",
          enabledModels: ["openai:gpt-5-mini"],
          grantSchemaAccess: false,
        },
      },
    })
    expect(getSelectedModel(settings)).toBe("openai:gpt-5-mini")
  })

  it("returns null when no models are enabled", () => {
    const settings = makeSettings({ providers: {} })
    expect(getSelectedModel(settings)).toBeNull()
  })
})

describe("getAllModelOptions", () => {
  it("keeps identical built-in model ids distinct while showing raw labels", () => {
    const settings = makeSettings({
      modelValueFormat: AI_MODEL_VALUE_FORMAT,
      selectedModel: "openai:shared-model",
      providers: {
        anthropic: {
          apiKey: "sk-ant",
          enabledModels: ["anthropic:shared-model"],
          grantSchemaAccess: false,
        },
        openai: {
          apiKey: "sk-openai",
          enabledModels: ["openai:shared-model"],
          grantSchemaAccess: false,
        },
      },
    })

    const options = getAllModelOptions(settings)

    expect(options).toEqual([
      {
        label: "Shared Model",
        value: "anthropic:shared-model",
        provider: "anthropic",
      },
      {
        label: "Shared Model",
        value: "openai:shared-model",
        provider: "openai",
      },
    ])
    expect(new Set(options.map((option) => option.value)).size).toBe(2)
    expect(providerForModel(options[1].value, settings)).toBe("openai")
  })

  it("builds options from enabled models with stored labels", () => {
    // Given a provider with one stored label and one without
    const settings = makeSettings({
      providers: {
        openai: {
          apiKey: "sk-test",
          enabledModels: ["openai:gpt-5.4", "openai:gpt-5-mini"],
          grantSchemaAccess: false,
          modelLabels: { "gpt-5.4": "GPT-5.4 (Custom)" },
        },
      },
    })
    // When options build
    const options = getAllModelOptions(settings)
    // Then the stored label wins and the formatter fills the gap
    expect(options).toEqual([
      {
        label: "GPT-5.4 (Custom)",
        value: "openai:gpt-5.4",
        provider: "openai",
      },
      {
        label: "GPT 5 Mini",
        value: "openai:gpt-5-mini",
        provider: "openai",
      },
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
  it("parses built-in and custom provider-qualified values", () => {
    const customProviders = {
      "custom-1": {
        type: "openai-chat-completions" as const,
        name: "Test",
        baseURL: "http://localhost:11434/v1",
        contextWindow: 100_000,
        models: ["llm-a"],
      },
    }

    expect(parseModelValue("openai:gpt-5.4", customProviders)).toEqual({
      providerId: "openai",
      rawModel: "gpt-5.4",
    })
    expect(parseModelValue("custom-1:llm-a", customProviders)).toEqual({
      providerId: "custom-1",
      rawModel: "llm-a",
    })
    expect(makeModelValue("openai", "openai:foo")).toBe("openai:openai:foo")
    expect(stripModelNamespace("openai:openai:foo", "openai")).toBe(
      "openai:foo",
    )
    expect(stripModelNamespace("anthropic:shared-model", "openai")).toBe(
      "anthropic:shared-model",
    )
  })

  it("finds the built-in provider that enabled the model", () => {
    const settings = makeSettings({
      providers: {
        anthropic: {
          apiKey: "sk-test",
          enabledModels: ["anthropic:claude-sonnet-5"],
          grantSchemaAccess: false,
        },
      },
    })
    expect(providerForModel("anthropic:claude-sonnet-5", settings)).toBe(
      "anthropic",
    )
    expect(providerForModel("gpt-5-mini", settings)).toBeNull()
  })

  it("treats a colon prefix as a namespace only when that custom provider exists", () => {
    // Given a custom provider named custom-1
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
    // Then only its own prefix resolves as a namespace
    expect(providerForModel("custom-1:llm-a", settings)).toBe("custom-1")
    expect(providerForModel("custom-1:llm-a")).toBeNull()
  })

  it("routes colon-containing listed ids to the built-in provider that enabled them", () => {
    // Given an OpenAI fine-tune id enabled under the built-in provider
    const fineTune = "openai:ft:gpt-4o-mini-2024-07-18:acme::BxK9pQ2r"
    const settings = makeSettings({
      providers: {
        openai: {
          apiKey: "sk-test",
          enabledModels: [fineTune],
          grantSchemaAccess: false,
        },
      },
    })
    // Then the ft: prefix is not mistaken for a custom provider
    expect(providerForModel(fineTune, settings)).toBe("openai")
  })
})

describe("getNextModel", () => {
  it("keeps the current model while it stays enabled", () => {
    expect(
      getNextModel("openai:gpt-5-mini", {
        openai: ["openai:gpt-5.4", "openai:gpt-5-mini"],
      }),
    ).toBe("openai:gpt-5-mini")
  })

  it("takes the first enabled model of any provider when the current one is gone", () => {
    const settings = makeSettings({
      providers: {
        anthropic: {
          apiKey: "sk-test",
          enabledModels: ["anthropic:claude-sonnet-5"],
          grantSchemaAccess: false,
        },
      },
    })
    expect(
      getNextModel(
        "openai:gpt-5-mini",
        { anthropic: ["anthropic:claude-sonnet-5"] },
        settings,
      ),
    ).toBe("anthropic:claude-sonnet-5")
  })

  it("returns null when nothing is enabled", () => {
    expect(getNextModel("openai:gpt-5-mini", {})).toBeNull()
  })

  it("stays on the outgoing model's provider when it still has models", () => {
    // Given gpt-5.4 was just disabled while OpenAI keeps gpt-5-mini enabled
    const updatedSettings = makeSettings({
      selectedModel: "openai:gpt-5.4",
      providers: {
        openai: {
          apiKey: "sk-test",
          enabledModels: ["openai:gpt-5-mini"],
          grantSchemaAccess: false,
        },
        anthropic: {
          apiKey: "sk-test",
          enabledModels: ["anthropic:claude-opus-5"],
          grantSchemaAccess: false,
        },
      },
    })

    // When picking the next model
    const next = getNextModel(
      "openai:gpt-5.4",
      {
        openai: ["openai:gpt-5-mini"],
        anthropic: ["anthropic:claude-opus-5"],
      },
      updatedSettings,
    )

    // Then it falls back within OpenAI instead of hopping to Anthropic
    expect(next).toBe("openai:gpt-5-mini")
  })
})

describe("getUtilityModel", () => {
  it("returns the persisted utility model for a built-in provider", () => {
    const settings = makeSettings({
      selectedModel: "openai:gpt-5.4",
      providers: {
        openai: {
          apiKey: "sk-test",
          enabledModels: ["openai:gpt-5.4"],
          grantSchemaAccess: false,
          utilityModel: "openai:gpt-5.6-luna",
        },
      },
    })
    expect(getUtilityModel("openai", settings)).toBe("openai:gpt-5.6-luna")
  })

  it("falls back to the selected model when nothing is persisted", () => {
    const settings = makeSettings({
      selectedModel: "openai:gpt-5.4",
      providers: {
        openai: {
          apiKey: "sk-test",
          enabledModels: ["openai:gpt-5.4"],
          grantSchemaAccess: false,
        },
      },
    })
    expect(getUtilityModel("openai", settings)).toBe("openai:gpt-5.4")
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
      selectedModel: "openai:gpt-5-mini",
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
      selectedModel: "openai:gpt-5-mini",
      providers: {
        openai: {
          apiKey: "sk-test",
          enabledModels: ["openai:gpt-5-mini"],
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
      selectedModel: "openai:gpt-5-mini",
      providers: {
        openai: {
          apiKey: "sk-test",
          enabledModels: ["openai:gpt-5-mini"],
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
      selectedModel: "openai:gpt-5-mini",
      providers: {
        openai: {
          apiKey: "sk-test",
          enabledModels: ["openai:gpt-5-mini"],
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

describe("buildListingMetadata", () => {
  const GPT5_ERA = Date.UTC(2025, 7, 7) / 1000
  const openaiListing = [
    { id: "gpt-5.4", created: GPT5_ERA + 300 },
    { id: "gpt-5.4-nano", created: GPT5_ERA + 300 },
    { id: "gpt-5-mini", created: GPT5_ERA + 200 },
    { id: "whisper-1", created: GPT5_ERA + 100 },
  ]

  it("derives labels and a cheap utility model from an OpenAI listing", () => {
    // Given enabled models including a manually added unlisted id
    const metadata = buildListingMetadata("openai", openaiListing, [
      "gpt-5.4",
      "my-proxy-model",
    ])

    // Then listed ids get derived labels and unlisted ids keep the raw value
    expect(metadata.modelLabels).toEqual({
      "gpt-5.4": "GPT 5.4",
      "my-proxy-model": "my-proxy-model",
    })
    // And the utility model comes from the cheap tier of the chat pool
    expect(metadata.utilityModel).toBe("openai:gpt-5.4-nano")
  })

  it("prefers provider labels and haiku-tier utility for an Anthropic listing", () => {
    // Given a listing with provider display names
    const listing = [
      { id: "claude-opus-5", label: "Claude Opus 5", created: 300 },
      { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", created: 200 },
    ]

    const metadata = buildListingMetadata("anthropic", listing, [
      "claude-opus-5",
    ])

    // Then the stored label is the provider's and utility picks the haiku tier
    expect(metadata.modelLabels).toEqual({ "claude-opus-5": "Claude Opus 5" })
    expect(metadata.utilityModel).toBe("anthropic:claude-haiku-4-5")
  })
})
