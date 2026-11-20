import type { LocalAgentSnapshot } from "./localAgentChannel"

export const LOCAL_AGENT_MODEL = "local-agent"

export const isLocalAgentModel = (model: string): boolean =>
  model === LOCAL_AGENT_MODEL

// The model the agent uses: the user's choice when the agent offers it,
// otherwise the agent's own current model.
export const effectiveAgentModel = (
  agent: LocalAgentSnapshot,
  preferredModel: string | null,
): string | null => {
  const model = agent.config?.model
  if (!model) return null
  return preferredModel &&
    model.choices.some((choice) => choice.value === preferredModel)
    ? preferredModel
    : model.current
}

// "Opus 5.5 · Claude Code", or just the agent name before its models are known.
export const localAgentDisplayName = (
  agent: LocalAgentSnapshot | null,
  preferredModel: string | null,
): string => {
  if (!agent) return "Local agent"
  const value = effectiveAgentModel(agent, preferredModel)
  const name = agent.config?.model?.choices.find(
    (choice) => choice.value === value,
  )?.name
  return name ? `${name} · ${agent.info.label}` : agent.info.label
}
