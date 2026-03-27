import { describe, it, expect, afterEach } from "vitest"
import { reconcileSettings, getSelectedModel, MODEL_OPTIONS } from "./settings"
import type { ModelOption } from "./settings"

import type { AiAssistantSettings } from "../../providers/LocalStorageProvider/types"

const makeSettings = (
  overrides: Partial<AiAssistantSettings> = {},
): AiAssistantSettings => ({
  providers: {},
  ...overrides,
})

describe("reconcileSettings", () => {
  it("removes stale model IDs from enabledModels", () => {
    const settings = makeSettings({
      providers: {
        openai: {
          apiKey: "sk-test",
          enabledModels: ["gpt-5-mini", "removed-model", "also-removed"],
          grantSchemaAccess: false,
        },
      },
    })
    const result = reconcileSettings(settings)
    expect(result.providers.openai!.enabledModels).toEqual(["gpt-5-mini"])
  })

  it("does not add defaultEnabled models when user has valid models", () => {
    const settings = makeSettings({
      providers: {
        anthropic: {
          apiKey: "sk-test",
          enabledModels: ["claude-sonnet-4-5"],
          grantSchemaAccess: false,
        },
      },
    })
    const result = reconcileSettings(settings)
    expect(result.providers.anthropic!.enabledModels).toEqual([
      "claude-sonnet-4-5",
    ])
  })

  it("leaves enabledModels empty when all previous models were removed", () => {
    const settings = makeSettings({
      providers: {
        anthropic: {
          apiKey: "sk-test",
          enabledModels: ["removed-model-1", "removed-model-2"],
          grantSchemaAccess: false,
        },
      },
    })
    const result = reconcileSettings(settings)
    expect(result.providers.anthropic!.enabledModels).toEqual([])
  })

  it("does not add defaults for unconfigured providers", () => {
    const settings = makeSettings({
      providers: {
        anthropic: {
          apiKey: "sk-test",
          enabledModels: ["claude-sonnet-4-5"],
          grantSchemaAccess: false,
        },
      },
    })
    const result = reconcileSettings(settings)
    expect(result.providers.openai).toBeUndefined()
  })

  it("is idempotent", () => {
    const settings = makeSettings({
      selectedModel: "claude-sonnet-4-5",
      providers: {
        anthropic: {
          apiKey: "sk-test",
          enabledModels: ["claude-sonnet-4-5", "stale-model"],
          grantSchemaAccess: true,
        },
        openai: {
          apiKey: "sk-test",
          enabledModels: ["gpt-5-mini"],
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

  it("clears selectedModel if not in any enabledModels", () => {
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
          enabledModels: ["gpt-5-mini", "stale-model"],
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

  it("does not return selectedModel if not in enabledModels", () => {
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
    expect(getSelectedModel(settings)).not.toBe("claude-sonnet-4-5")
    expect(getSelectedModel(settings)).toBe("gpt-5-mini")
  })

  it("returns null when no models are enabled", () => {
    const settings = makeSettings({ providers: {} })
    expect(getSelectedModel(settings)).toBeNull()
  })
})

/**
 * Simulates version upgrades by temporarily replacing MODEL_OPTIONS contents.
 * Tests verify that user settings from a previous version are handled correctly
 * when the app is updated with a different model list.
 */
describe("version compatibility scenarios", () => {
  let originalOptions: ModelOption[]

  function setModelOptions(options: ModelOption[]) {
    originalOptions = [...MODEL_OPTIONS]
    MODEL_OPTIONS.length = 0
    MODEL_OPTIONS.push(...options)
  }

  afterEach(() => {
    MODEL_OPTIONS.length = 0
    MODEL_OPTIONS.push(...originalOptions)
  })

  it("upgrade: model removed, selectedModel was that model", () => {
    // v1: user had model-A and model-B, selected model-A
    setModelOptions([
      { label: "A", value: "model-a", provider: "openai" },
      { label: "B", value: "model-b", provider: "openai" },
    ])

    const v1Settings = makeSettings({
      selectedModel: "model-a",
      providers: {
        openai: {
          apiKey: "sk-test",
          enabledModels: ["model-a", "model-b"],
          grantSchemaAccess: false,
        },
      },
    })

    // v2: model-A removed, model-C added
    setModelOptions([
      { label: "B", value: "model-b", provider: "openai" },
      {
        label: "C",
        value: "model-c",
        provider: "openai",
        defaultEnabled: true,
      },
    ])

    const reconciled = reconcileSettings(v1Settings)
    expect(reconciled.providers.openai!.enabledModels).toEqual(["model-b"])
    expect(reconciled.selectedModel).toBe("model-b")
  })

  it("upgrade: all models removed for a provider", () => {
    setModelOptions([{ label: "A", value: "model-a", provider: "openai" }])

    const v1Settings = makeSettings({
      selectedModel: "model-a",
      providers: {
        openai: {
          apiKey: "sk-test",
          enabledModels: ["model-a"],
          grantSchemaAccess: false,
        },
      },
    })

    // v2: provider's models completely replaced
    setModelOptions([
      {
        label: "X",
        value: "model-x",
        provider: "openai",
        defaultEnabled: true,
      },
      { label: "Y", value: "model-y", provider: "openai" },
    ])

    const reconciled = reconcileSettings(v1Settings)
    // all old models gone, empty list — user must re-enable in settings
    expect(reconciled.providers.openai!.enabledModels).toEqual([])
    expect(reconciled.selectedModel).toBeUndefined()
    expect(getSelectedModel(reconciled)).toBeNull()
  })

  it("upgrade: new models added, user keeps their selection", () => {
    setModelOptions([
      { label: "A", value: "model-a", provider: "anthropic", default: true },
      { label: "B", value: "model-b", provider: "anthropic" },
    ])

    const v1Settings = makeSettings({
      selectedModel: "model-b",
      providers: {
        anthropic: {
          apiKey: "sk-test",
          enabledModels: ["model-a", "model-b"],
          grantSchemaAccess: true,
        },
      },
    })

    // v2: model-C added
    setModelOptions([
      { label: "A", value: "model-a", provider: "anthropic", default: true },
      { label: "B", value: "model-b", provider: "anthropic" },
      {
        label: "C",
        value: "model-c",
        provider: "anthropic",
        defaultEnabled: true,
      },
    ])

    const reconciled = reconcileSettings(v1Settings)
    // existing models preserved, new model NOT auto-added
    expect(reconciled.providers.anthropic!.enabledModels).toEqual([
      "model-a",
      "model-b",
    ])
    expect(reconciled.selectedModel).toBe("model-b")
    expect(getSelectedModel(reconciled)).toBe("model-b")
  })

  it("upgrade: selected model survives but some enabled models removed", () => {
    setModelOptions([
      { label: "A", value: "model-a", provider: "openai" },
      { label: "B", value: "model-b", provider: "openai" },
      { label: "C", value: "model-c", provider: "openai" },
    ])

    const v1Settings = makeSettings({
      selectedModel: "model-b",
      providers: {
        openai: {
          apiKey: "sk-test",
          enabledModels: ["model-a", "model-b", "model-c"],
          grantSchemaAccess: false,
        },
      },
    })

    // v2: model-A and model-C removed
    setModelOptions([
      { label: "B", value: "model-b", provider: "openai" },
      { label: "D", value: "model-d", provider: "openai" },
    ])

    const reconciled = reconcileSettings(v1Settings)
    expect(reconciled.providers.openai!.enabledModels).toEqual(["model-b"])
    expect(reconciled.selectedModel).toBe("model-b")
    expect(getSelectedModel(reconciled)).toBe("model-b")
  })

  it("downgrade: user has models from a newer version", () => {
    setModelOptions([{ label: "A", value: "model-a", provider: "openai" }])

    const futureSettings = makeSettings({
      selectedModel: "model-future",
      providers: {
        openai: {
          apiKey: "sk-test",
          enabledModels: ["model-a", "model-future"],
          grantSchemaAccess: false,
        },
      },
    })

    const reconciled = reconcileSettings(futureSettings)
    expect(reconciled.providers.openai!.enabledModels).toEqual(["model-a"])
    expect(reconciled.selectedModel).toBe("model-a")
  })
})
