import type { LocalAgentSnapshot } from "../../../utils/localAgent/localAgentChannel"
import type { BridgeVersionMismatch } from "../../../utils/mcp/protocolVersion"
import type { McpClient } from "../../../utils/mcp/mcpClients"
import { chatAgentNames } from "../../../utils/localAgent/chatAgents"
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

// Chat mode: what the console shows of the agent the user chats with in the
// AI Assistant. Its connection comes first: an agent that is not connected
// has no state of its own yet.
export const chatAgentStatusOf = ({
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
  const names = chatAgentNames(agentLabel)
  if (versionMismatch === "major") {
    return {
      tone: "error",
      label: `${agentLabel} needs an update`,
      description: `${names.subject} runs a version this console does not support.`,
    }
  }
  if (bridgeTone === "error" || bridgeTone === "idle") {
    return {
      tone: "error",
      label: `${agentLabel} disconnected`,
      description: `${names.subject} is no longer connected.`,
    }
  }
  if (bridgeTone === "connecting" || !agent) {
    return {
      tone: "connecting",
      label: `${agentLabel} connecting…`,
      description: `Connecting to ${names.inline} on your computer.`,
    }
  }
  if (agent.state === "error") {
    return {
      tone: AGENT_TONES.error,
      label: `${agentLabel} ${AGENT_STATE_WORDS.error}`,
      description: agent.error ?? `${names.subject} is unavailable.`,
    }
  }
  if (versionMismatch === "minor" && agent.state === "ready") {
    return {
      tone: "warning",
      label: `${agentLabel} connected`,
      description: `${names.subject} is connected, but runs a different version than this console expects.`,
    }
  }
  return {
    tone: AGENT_TONES[agent.state],
    label: `${agentLabel} ${AGENT_STATE_WORDS[agent.state]}`,
    description:
      agent.state === "starting"
        ? `${names.subject} is starting on your computer.`
        : `${names.subject} works in the AI Assistant.`,
  }
}

// How a screen names the MCP mode agent: its name when the console knows it,
// otherwise "Agent" in a label and "your coding agent" in a sentence.
export const mcpAgentNames = (client: McpClient | null) => ({
  // Starts a short label: "Claude Code connected", "Agent connected".
  label: client?.label ?? "Agent",
  // Starts a sentence: "Claude Code works…", "Your coding agent works…".
  subject: client?.label ?? "Your agent",
  // Inside a sentence: "Connecting to Claude Code", "… to your agent".
  inline: client?.label ?? "your agent",
})

// MCP mode: what the console shows of the coding agent that works from the
// user's terminal and uses the console. Never says MCP.
export const mcpAgentStatusOf = ({
  tone,
  client,
  versionMismatch,
}: {
  tone: Tone
  client: McpClient | null
  versionMismatch: BridgeVersionMismatch | null
}): AgentStatus => {
  const names = mcpAgentNames(client)
  if (versionMismatch === "major") {
    return {
      tone: "error",
      label: `${names.label} needs an update`,
      description: `${names.subject} runs a version this console does not support.`,
    }
  }
  switch (tone) {
    case "idle":
      return {
        tone,
        label: "Connect agent",
        description: "Connect your coding agent to this console.",
      }
    case "connecting":
      return {
        tone,
        label: `${names.label} connecting…`,
        description: `Connecting to ${names.inline}.`,
      }
    case "connected":
      return {
        tone,
        label: `${names.label} connected`,
        description: `${names.subject} works from your terminal.`,
      }
    case "warning":
      return {
        tone,
        label: `${names.label} connected`,
        description: `${names.subject} is connected, but runs a different version than this console expects.`,
      }
    case "error":
      return {
        tone,
        label: `${names.label} disconnected`,
        description: `${names.subject} is no longer connected.`,
      }
  }
}

export { chatAgentNames }
