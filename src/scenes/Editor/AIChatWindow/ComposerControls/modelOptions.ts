import type { AiAssistantSettings } from "../../../../providers/LocalStorageProvider/types"
import {
  BUILTIN_PROVIDERS,
  getAllModelOptions,
  getProviderName,
  providerForModel,
} from "../../../../utils/ai"
import type { LocalAgentSnapshot } from "../../../../utils/localAgent/localAgentChannel"
import {
  effectiveAgentModel,
  LOCAL_AGENT_MODEL,
} from "../../../../utils/localAgent/localAgentModel"
import type { ResolvedLocalAgentPreferences } from "../../../../utils/localAgent/localAgentSettings"
import type { AgentConfigChoice } from "../../../../utils/localAgent/protocol"

export type ModelSelection =
  | { kind: "api"; model: string }
  // A null model is the agent's own default, for agents that list no models.
  | { kind: "agent"; agentId: string; model: string | null }

export type ModelOption = {
  key: string
  label: string
  detail: string | null
  selection: ModelSelection
}

export type ModelGroup = {
  key: string
  label: string
  caption: string | null
  provider: string | null
  options: ModelOption[]
}

export type EffortChoice = {
  value: string
  label: string
}

export type EffortControl = {
  current: string
  choices: EffortChoice[]
}

const agentOptionKey = (agentId: string, model: string | null) =>
  `agent:${agentId}:${model ?? ""}`

// Agents often repeat the model name at the start of its description
// ("Opus 5.5 · Best for everyday tasks"); the row already shows the name.
const agentChoiceDetail = (choice: AgentConfigChoice): string | null => {
  const description = choice.description?.trim()
  if (!description) return null
  const prefix = `${choice.name} · `
  return description.startsWith(prefix)
    ? description.slice(prefix.length)
    : description
}

const capitalize = (text: string): string =>
  text.charAt(0).toUpperCase() + text.slice(1)

// Cursor includes the fixed effort in the model ID instead of advertising
// a separate setting. Read it for display only; always send the ID unchanged.
const cursorReasoningDetail = (modelId: string): string | null => {
  const parameters = modelId.match(/\[([^\]]+)\]$/)?.[1]
  const effort = parameters?.match(
    /(?:^|,)\s*(?:reasoning_effort|effort)=([a-z]+)\s*(?=,|$)/,
  )?.[1]
  if (!effort) return null
  return `Reasoning: ${effort === "xhigh" ? "Extra high" : capitalize(effort)}`
}

const apiModelGroups = (
  settings: AiAssistantSettings,
  enabledModels: string[],
): ModelGroup[] => {
  const groups = new Map<string, ModelGroup>()
  for (const model of getAllModelOptions(settings)) {
    if (!enabledModels.includes(model.value)) continue
    const group = groups.get(model.provider) ?? {
      key: `api:${model.provider}`,
      label: getProviderName(model.provider, settings),
      caption: null,
      provider: model.provider,
      options: [],
    }
    group.options.push({
      key: `api:${model.value}`,
      label: model.label,
      detail: null,
      selection: { kind: "api", model: model.value },
    })
    groups.set(model.provider, group)
  }
  return Array.from(groups.values())
}

const agentDefaultOption = (agent: LocalAgentSnapshot): ModelOption => ({
  key: agentOptionKey(agent.info.id, null),
  label: "Default model",
  detail: null,
  selection: { kind: "agent", agentId: agent.info.id, model: null },
})

const agentModelGroup = (agent: LocalAgentSnapshot): ModelGroup => {
  const choices = agent.config?.model?.choices ?? []
  const showFixedEffort =
    agent.info.id === "cursor" && !agent.config?.effort?.choices.length
  return {
    key: `agent:${agent.info.id}`,
    label: agent.info.label,
    caption: "Agent",
    provider: null,
    options:
      choices.length === 0
        ? [agentDefaultOption(agent)]
        : choices.map((choice) => ({
            key: agentOptionKey(agent.info.id, choice.value),
            label: choice.name,
            detail:
              [
                showFixedEffort ? cursorReasoningDetail(choice.value) : null,
                agentChoiceDetail(choice),
              ]
                .filter(Boolean)
                .join(" · ") || null,
            selection: {
              kind: "agent",
              agentId: agent.info.id,
              model: choice.value,
            },
          })),
  }
}

export const buildModelGroups = (
  settings: AiAssistantSettings,
  enabledModels: string[],
  agent: LocalAgentSnapshot | null,
): ModelGroup[] => [
  ...apiModelGroups(settings, enabledModels),
  ...(agent ? [agentModelGroup(agent)] : []),
]

export const selectedOptionKey = (
  currentModel: string | null,
  agent: LocalAgentSnapshot | null,
  agentPreferences: ResolvedLocalAgentPreferences,
): string | null => {
  if (currentModel === LOCAL_AGENT_MODEL && agent) {
    return agentOptionKey(
      agent.info.id,
      effectiveAgentModel(agent, agentPreferences.model),
    )
  }
  return currentModel ? `api:${currentModel}` : null
}

export const findOption = (
  groups: ModelGroup[],
  key: string | null,
): { group: ModelGroup; option: ModelOption | null } | null => {
  if (!key) return null
  for (const group of groups) {
    if (group.key === key) return { group, option: null }
    const option = group.options.find((candidate) => candidate.key === key)
    if (option) return { group, option }
  }
  return null
}

// Matches the model name, its id, its detail line and its provider or agent,
// so "anthropic", "opus" and "claude-opus-5-5" all find the same row.
export const filterModelGroups = (
  groups: ModelGroup[],
  query: string,
): ModelGroup[] => {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return groups
  return groups
    .map((group) => ({
      ...group,
      options: group.options.filter((option) => {
        const haystack = [
          option.label,
          option.detail ?? "",
          option.selection.model,
          group.label,
          group.caption ?? "",
        ]
          .join(" ")
          .toLowerCase()
        return terms.every((term) => haystack.includes(term))
      }),
    }))
    .filter((group) => group.options.length > 0)
}

const API_EFFORT_CHOICES: EffortChoice[] = [
  { value: "default", label: "Default" },
  { value: "high", label: "High" },
]

// The effort levels the selected model offers, or null when it has none:
// OpenAI models take Default or High, an agent offers its own levels.
export const effortControlFor = (
  currentModel: string | null,
  settings: AiAssistantSettings,
  agent: LocalAgentSnapshot | null,
  agentPreferences: ResolvedLocalAgentPreferences,
): EffortControl | null => {
  if (currentModel === LOCAL_AGENT_MODEL) {
    const effort = agent?.config?.effort
    if (!effort || effort.choices.length === 0) return null
    const preferred = agentPreferences.effort
    return {
      current:
        preferred && effort.choices.some((choice) => choice.value === preferred)
          ? preferred
          : effort.current,
      choices: effort.choices.map((choice) => ({
        value: choice.value,
        label: capitalize(choice.name),
      })),
    }
  }
  if (!currentModel) return null
  const provider = providerForModel(currentModel, settings)
  if (!provider || BUILTIN_PROVIDERS[provider]?.type !== "openai") return null
  return {
    current: settings.providers?.[provider]?.reasoningEffort ?? "default",
    choices: API_EFFORT_CHOICES,
  }
}
