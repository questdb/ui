import { describe, expect, it } from "vitest"
import { migrateLocalStorage } from "./migrate"
import { stripModelNamespace } from "../ai/settings"
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

const migrateSettings = (
  settings: AiAssistantSettings,
): AiAssistantSettings => {
  let stored = JSON.stringify(settings)
  migrateLocalStorage({
    getItem: () => stored,
    setItem: (_key, value) => {
      stored = value
    },
  })
  return JSON.parse(stored) as AiAssistantSettings
}

describe("migrateLocalStorage", () => {
  it("isolates local-storage read and write failures", () => {
    expect(
      migrateLocalStorage({
        getItem: () => {
          throw new Error("storage unavailable")
        },
        setItem: () => undefined,
      }),
    ).toBe(false)

    expect(
      migrateLocalStorage({
        getItem: () =>
          JSON.stringify({
            providers: {},
          }),
        setItem: () => {
          throw new Error("storage quota exceeded")
        },
      }),
    ).toBe(false)
  })

  it.each([AI_MODEL_VALUE_FORMAT, 3])(
    "does not touch settings carrying format version %s",
    (modelValueFormat) => {
      const stored = JSON.stringify({
        modelValueFormat,
        selectedModel: "openai:openai:foo",
        providers: {
          openai: {
            apiKey: "sk-test",
            enabledModels: ["openai:openai:foo"],
            grantSchemaAccess: false,
          },
        },
        futureField: "preserved byte-for-byte",
      })
      let writes = 0

      migrateLocalStorage({
        getItem: () => stored,
        setItem: () => {
          writes += 1
        },
      })

      expect(writes).toBe(0)
    },
  )

  it("migrates built-in model values and utility models to provider-qualified storage", () => {
    const settings = makeSettings({
      selectedModel: "gpt-5.4",
      providers: {
        openai: {
          apiKey: "sk-test",
          enabledModels: ["gpt-5.4", "gpt-5-mini"],
          utilityModel: "gpt-5-mini",
          modelLabels: { "gpt-5.4": "GPT-5.4" },
          grantSchemaAccess: false,
        },
      },
    })

    const result = migrateSettings(settings)

    expect(result.modelValueFormat).toBe(AI_MODEL_VALUE_FORMAT)
    expect(result.selectedModel).toBe("openai:gpt-5.4")
    expect(result.providers.openai!.enabledModels).toEqual([
      "openai:gpt-5.4",
      "openai:gpt-5-mini",
    ])
    expect(result.providers.openai!.utilityModel).toBe("openai:gpt-5-mini")
    expect(result.providers.openai!.modelLabels).toEqual({
      "gpt-5.4": "GPT-5.4",
    })
  })

  it("preserves a literal provider prefix inside a legacy model id", () => {
    const result = migrateSettings(
      makeSettings({
        selectedModel: "openai:foo",
        providers: {
          openai: {
            apiKey: "sk-test",
            enabledModels: ["openai:foo"],
            grantSchemaAccess: false,
          },
        },
      }),
    )

    expect(result.selectedModel).toBe("openai:openai:foo")
    expect(result.providers.openai!.enabledModels).toEqual([
      "openai:openai:foo",
    ])
    expect(stripModelNamespace(result.selectedModel!, "openai")).toBe(
      "openai:foo",
    )
  })

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
    // When storage migrates
    const result = migrateSettings(settings)
    // Then availability is the picker's job, not the migration's
    expect(result.providers.openai!.enabledModels).toEqual([
      "openai:gpt-7",
      "openai:gpt-5-mini",
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
    const result = migrateSettings(settings)
    expect(result.providers.openai!.enabledModels).toEqual([
      "openai:gpt-5.4",
      "openai:gpt-5-mini",
    ])
  })

  it("also collapses legacy reasoning variants for built-in Anthropic models", () => {
    const settings = makeSettings({
      selectedModel: "claude-sonnet@reasoning=high",
      providers: {
        anthropic: {
          apiKey: "sk-test",
          enabledModels: ["claude-sonnet@reasoning=high"],
          grantSchemaAccess: false,
        },
      },
    })
    const result = migrateSettings(settings)
    expect(result.providers.anthropic!.enabledModels).toEqual([
      "anthropic:claude-sonnet",
    ])
    expect(result.selectedModel).toBe("anthropic:claude-sonnet")
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
    // When storage migrates
    const result = migrateSettings(settings)
    // Then the provider runs on High and the selection is the plain id
    expect(result.providers.openai!.reasoningEffort).toBe("high")
    expect(result.selectedModel).toBe("openai:gpt-5.4")
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
    const result = migrateSettings(settings)
    expect(result.providers.openai!.reasoningEffort).toBeUndefined()
    expect(result.selectedModel).toBe("openai:gpt-5.4")
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
    const result = migrateSettings(settings)
    expect(result.providers["custom-1"]!.enabledModels).toEqual([
      "custom-1:llm-a",
    ])
  })

  it("preserves reasoning-like suffixes in custom provider model ids", () => {
    const customModels = [
      "vendor-model@reasoning=high",
      "vendor-model@reasoning=medium",
      "vendor-model@reasoning=low",
    ]
    const enabledModels = customModels.map((model) => `custom-1:${model}`)
    const settings = makeSettings({
      selectedModel: enabledModels[0],
      customProviders: {
        "custom-1": {
          type: "openai-chat-completions",
          name: "Test",
          baseURL: "http://localhost:11434/v1",
          contextWindow: 100_000,
          models: customModels,
        },
      },
      providers: {
        "custom-1": {
          apiKey: "",
          enabledModels,
          grantSchemaAccess: false,
        },
      },
    })
    const result = migrateSettings(settings)
    expect(result.providers["custom-1"]!.enabledModels).toEqual(enabledModels)
    expect(result.selectedModel).toBe(enabledModels[0])
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
    const once = migrateSettings(settings)
    const twice = migrateSettings(once)
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
    const result = migrateSettings(settings)
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
    const result = migrateSettings(settings)
    expect(result.selectedModel).toEqual("openai:gpt-5-mini")
  })

  it("preserves selectedModel if it is in enabledModels", () => {
    const settings = makeSettings({
      selectedModel: "openai:gpt-5-mini",
      providers: {
        openai: {
          apiKey: "sk-test",
          enabledModels: ["gpt-5-mini"],
          grantSchemaAccess: false,
        },
      },
    })
    const result = migrateSettings(settings)
    expect(result.selectedModel).toBe("openai:gpt-5-mini")
  })

  it("handles empty providers gracefully", () => {
    const settings = makeSettings({ providers: {} })
    const result = migrateSettings(settings)
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
    migrateSettings(settings)
    expect(settings.providers.openai!.enabledModels).toEqual(originalModels)
  })
})
