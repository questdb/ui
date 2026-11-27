import { DEFAULT_AGENT_LABEL } from "../mcp/pairValidation"

// The agents the `connect` command runs (`--agent <id>`) for the AI
// Assistant. Ids and labels match the MCP server's agent presets.
export type ChatAgent = { id: string; label: string }

export const CHAT_AGENTS: ChatAgent[] = [
  { id: "claude", label: "Claude Code" },
  { id: "codex", label: "Codex" },
  { id: "gemini", label: "Gemini CLI" },
  { id: "copilot", label: "GitHub Copilot" },
  { id: "cursor", label: "Cursor" },
  { id: "opencode", label: "OpenCode" },
  { id: "pi", label: "Pi" },
]

const chatAgentById = (id: string): ChatAgent | null =>
  CHAT_AGENTS.find((agent) => agent.id === id) ?? null

// The preset behind a connected agent: by id, or by its label when only the
// label is known (a pairing link names the agent, not its id). A custom
// agent (--agent-command) has none.
export const chatAgentOf = (
  info: { id?: string; label?: string } | null | undefined,
): ChatAgent | null =>
  (info?.id ? chatAgentById(info.id) : null) ??
  CHAT_AGENTS.find((agent) => agent.label === info?.label) ??
  null

// How a screen names the agent of the AI Assistant way. A pairing link
// without a name gives "Agent", which reads as "your coding agent" in a
// sentence.
export const chatAgentNames = (agentLabel: string) => {
  const known = agentLabel !== DEFAULT_AGENT_LABEL
  return {
    label: agentLabel,
    subject: known ? agentLabel : "Your agent",
    inline: known ? agentLabel : "your agent",
  }
}
