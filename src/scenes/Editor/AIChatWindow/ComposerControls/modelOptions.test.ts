import { describe, expect, it } from "vitest"
import type { AiAssistantSettings } from "../../../../providers/LocalStorageProvider/types"
import type { LocalAgentSnapshot } from "../../../../utils/localAgent/localAgentChannel"
import { LOCAL_AGENT_MODEL } from "../../../../utils/localAgent/localAgentModel"
import {
  buildModelGroups,
  effortControlFor,
  filterModelGroups,
  selectedOptionKey,
} from "./modelOptions"

const settings: AiAssistantSettings = {
  modelValueFormat: 2,
  selectedModel: "openai:gpt-5",
  providers: {
    openai: {
      apiKey: "key",
      enabledModels: ["openai:gpt-5", "openai:gpt-5-mini"],
      grantSchemaAccess: true,
      reasoningEffort: "high",
    },
    anthropic: {
      apiKey: "key",
      enabledModels: ["anthropic:claude-haiku-4-5"],
      grantSchemaAccess: true,
    },
  },
}

const enabledModels = [
  "openai:gpt-5",
  "openai:gpt-5-mini",
  "anthropic:claude-haiku-4-5",
]

const agent: LocalAgentSnapshot = {
  info: { id: "pi", label: "Pi", cwd: "/work" },
  state: "ready",
  error: null,
  questions: [],
  commands: [],
  acceptsImages: false,
  config: {
    model: {
      id: "model",
      current: "anthropic/claude-opus-5-5",
      choices: [
        {
          value: "anthropic/claude-opus-5-5",
          name: "Claude Opus 5.5",
          description: "anthropic · claude-opus-5-5",
          group: null,
        },
        {
          value: "openai/gpt-6",
          name: "GPT 6",
          description: "GPT 6 · Latest OpenAI model",
          group: null,
        },
      ],
    },
    effort: {
      id: "thinking",
      current: "high",
      choices: [
        { value: "low", name: "low", description: null, group: null },
        { value: "high", name: "high", description: null, group: null },
      ],
    },
  },
}

const agentPreferences = {
  model: null,
  effort: null,
}

describe("buildModelGroups", () => {
  it("groups API models by provider and lists the agent's own models last", () => {
    // When
    const groups = buildModelGroups(settings, enabledModels, agent)

    // Then
    expect(
      groups.map((group) => [group.label, group.options.map((o) => o.label)]),
    ).toEqual([
      ["Anthropic", ["Claude Haiku 4.5"]],
      ["OpenAI", ["GPT 5", "GPT 5 Mini"]],
      ["Pi", ["Claude Opus 5.5", "GPT 6"]],
    ])
    expect(groups[2]).toMatchObject({ caption: "Local agent", provider: null })
    expect(groups[2].options[1].detail).toBe("Latest OpenAI model")
  })

  it("shows Cursor's fixed reasoning effort without offering an effort control", () => {
    // Given
    const current = "grok-4.7[context=256k,reasoning_effort=high,fast=true]"
    const config = {
      effort: null,
      model: {
        id: "model",
        current,
        choices: [
          { value: current, name: "grok-4.7", description: null, group: null },
          {
            value: "other[effort=xhigh,fast=false]",
            name: "Other model",
            description: "Other model · A description",
            group: null,
          },
          { value: "auto", name: "Auto", description: null, group: null },
        ],
      },
    }
    const cursor: LocalAgentSnapshot = {
      ...agent,
      info: { ...agent.info, id: "cursor", label: "Cursor" },
      config,
    }

    // When
    const [group] = buildModelGroups(settings, [], cursor)
    const control = effortControlFor(
      LOCAL_AGENT_MODEL,
      settings,
      cursor,
      agentPreferences,
    )

    // Then
    expect(group.options.map(({ detail }) => detail)).toEqual([
      "Reasoning: High",
      "Reasoning: Extra high · A description",
      null,
    ])
    expect(group.options[0].selection).toEqual({
      kind: "agent",
      agentId: "cursor",
      model: current,
    })
    expect(control).toBeNull()

    // When the agent provides a separate setting, it takes precedence.
    const configurable = {
      ...cursor,
      config: { ...config, effort: agent.config?.effort ?? null },
    }

    // Then
    expect(
      buildModelGroups(settings, [], configurable)[0].options[0].detail,
    ).toBeNull()
  })
})

describe("filterModelGroups", () => {
  it("finds a model by its id, provider or agent name", () => {
    // Given
    const groups = buildModelGroups(settings, enabledModels, agent)

    // When
    const byId = filterModelGroups(groups, "claude-opus")
    const byAgent = filterModelGroups(groups, "pi gpt")
    const nothing = filterModelGroups(groups, "llama")

    // Then
    expect(byId.flatMap((g) => g.options.map((o) => o.label))).toEqual([
      "Claude Opus 5.5",
    ])
    expect(byAgent.flatMap((g) => g.options.map((o) => o.label))).toEqual([
      "GPT 6",
    ])
    expect(nothing).toEqual([])
  })
})

describe("an agent that lists no models", () => {
  it("can still be picked, with its own default model", () => {
    // Given
    const starting: LocalAgentSnapshot = {
      ...agent,
      state: "starting",
      config: null,
    }

    // When
    const [group] = buildModelGroups(settings, [], starting)
    const key = selectedOptionKey(LOCAL_AGENT_MODEL, starting, agentPreferences)

    // Then
    expect(group.options).toEqual([
      {
        key: "agent:pi:",
        label: "Default model",
        detail: null,
        selection: { kind: "agent", agentId: "pi", model: null },
      },
    ])
    expect(key).toBe("agent:pi:")
  })
})

describe("selectedOptionKey", () => {
  it("points at the agent's current model when the preferred one is not offered", () => {
    // When
    const key = selectedOptionKey(LOCAL_AGENT_MODEL, agent, {
      ...agentPreferences,
      model: "retired-model",
    })

    // Then
    expect(key).toBe("agent:pi:anthropic/claude-opus-5-5")
  })
})

describe("effortControlFor", () => {
  it("offers Default and High for OpenAI models and nothing for Anthropic API models", () => {
    // When
    const openai = effortControlFor(
      "openai:gpt-5",
      settings,
      null,
      agentPreferences,
    )
    const anthropic = effortControlFor(
      "anthropic:claude-haiku-4-5",
      settings,
      null,
      agentPreferences,
    )

    // Then
    expect(openai).toEqual({
      current: "high",
      choices: [
        { value: "default", label: "Default" },
        { value: "high", label: "High" },
      ],
    })
    expect(anthropic).toBeNull()
  })

  it("offers the agent's own levels with the user's choice selected", () => {
    // When
    const control = effortControlFor(LOCAL_AGENT_MODEL, settings, agent, {
      ...agentPreferences,
      effort: "low",
    })

    // Then
    expect(control).toEqual({
      current: "low",
      choices: [
        { value: "low", label: "Low" },
        { value: "high", label: "High" },
      ],
    })
  })
})
