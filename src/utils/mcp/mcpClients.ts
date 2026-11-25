// MCP mode: the coding agent that runs the MCP server sends its name in MCP
// `initialize` (clientInfo.name), and the server passes it on as `mcpClient`.
// Names are ids like "codex-mcp-client", so the console shows a label for the
// ones it knows and "your coding agent" for the rest.

import { CHAT_AGENTS, type ChatAgent } from "../localAgent/chatAgents"

export type McpClient = {
  label: string
  // The agent to suggest for the AI Assistant; null when there is none.
  chatAgent: ChatAgent | null
}

const preset = (id: string): ChatAgent =>
  CHAT_AGENTS.find((agent) => agent.id === id) as ChatAgent
const CLAUDE_CODE = preset("claude")
const CODEX = preset("codex")
const CURSOR = preset("cursor")
const GEMINI = preset("gemini")
const COPILOT = preset("copilot")
const OPENCODE = preset("opencode")
const PI = preset("pi")

const same = (agent: ChatAgent): McpClient => ({
  label: agent.label,
  chatAgent: agent,
})

// Keys are lower case. Measured with each agent's ACP adapter or CLI, except
// where noted.
const KNOWN_CLIENTS: Record<string, McpClient> = {
  "claude-code": same(CLAUDE_CODE),
  // Claude Desktop (from public reports). Its user may not have Claude Code,
  // so the AI Assistant way asks which agent to run.
  "claude-ai": { label: "Claude Desktop", chatAgent: null },
  "codex-mcp-client": same(CODEX),
  // The Cursor CLI sends "Cursor"; the Cursor app "cursor-vscode" (reports).
  cursor: same(CURSOR),
  "cursor-vscode": same(CURSOR),
  // From the Gemini CLI source.
  "gemini-cli-mcp-client": same(GEMINI),
  "copilot-cli": same(COPILOT),
  // VS Code's agent is GitHub Copilot (from public reports).
  "visual studio code": { label: "VS Code", chatAgent: COPILOT },
  "visual-studio-code": { label: "VS Code", chatAgent: COPILOT },
  opencode: same(OPENCODE),
  pi: same(PI),
}

// Older Gemini CLIs append the server name; VS Code Insiders adds a suffix.
const KNOWN_PREFIXES: Array<[string, McpClient]> = [
  ["gemini-cli-mcp-client-", same(GEMINI)],
  ["visual studio code - ", { label: "VS Code", chatAgent: COPILOT }],
]

export const mcpClientOf = (
  name: string | null | undefined,
): McpClient | null => {
  if (!name) return null
  const key = name.trim().toLowerCase()
  const known = KNOWN_CLIENTS[key]
  if (known) return known
  const prefixed = KNOWN_PREFIXES.find(([prefix]) => key.startsWith(prefix))
  return prefixed ? prefixed[1] : null
}
