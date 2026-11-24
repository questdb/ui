import type { LocalAgentSnapshot } from "../../../utils/localAgent/localAgentChannel"
import type { BridgeVersionMismatch } from "../../../utils/mcp/protocolVersion"
import type { Tone } from "./tone"

const AGENT_TONES = {
  ready: "connected",
  starting: "connecting",
  error: "warning",
} as const satisfies Record<LocalAgentSnapshot["state"], Tone>

const AGENT_STATE_WORDS = {
  ready: "connected",
  starting: "starting…",
  error: "unavailable",
} as const satisfies Record<LocalAgentSnapshot["state"], string>

export type AgentStatus = {
  tone: Tone
  // The pill's text.
  label: string
  // The pill's tooltip, and the popover's description.
  description: string
}

// What the console shows of a paired coding agent. Its connection comes
// first: an agent that is not connected has no state of its own yet.
export const agentStatusOf = ({
  agentLabel,
  agent,
  bridgeTone,
  versionMismatch,
}: {
  agentLabel: string
  agent: LocalAgentSnapshot | null
  bridgeTone: Tone
  versionMismatch: BridgeVersionMismatch | null
}): AgentStatus => {
  if (versionMismatch === "major") {
    return {
      tone: "error",
      label: `${agentLabel} needs an update`,
      description: `This console does not support the version ${agentLabel} runs with.`,
    }
  }
  if (bridgeTone === "error" || bridgeTone === "idle") {
    return {
      tone: "error",
      label: `${agentLabel} disconnected`,
      description: `${agentLabel} is no longer connected. Run the connect command again in your terminal.`,
    }
  }
  if (bridgeTone === "connecting" || !agent) {
    return {
      tone: "connecting",
      label: `${agentLabel} connecting…`,
      description: `Connecting to ${agentLabel} on your computer.`,
    }
  }
  if (agent.state === "error") {
    return {
      tone: AGENT_TONES.error,
      label: `${agentLabel} ${AGENT_STATE_WORDS.error}`,
      description: agent.error ?? `${agentLabel} is unavailable.`,
    }
  }
  return {
    tone: versionMismatch === "minor" ? "warning" : AGENT_TONES[agent.state],
    label: `${agentLabel} ${AGENT_STATE_WORDS[agent.state]}`,
    description:
      agent.state === "starting"
        ? `${agentLabel} is starting on your computer.`
        : `${agentLabel} runs on your computer. Chat with it in the AI Assistant.`,
  }
}
