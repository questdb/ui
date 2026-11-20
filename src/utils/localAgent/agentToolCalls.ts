import type { AgentUpdate } from "./protocol"

type AgentToolCall = Extract<AgentUpdate, { kind: "tool_call" }>

// questdb: shown through the console's own status for the call.
// review / lookup: agent housekeeping, shown only while it runs.
// own: the agent's own tools, like commands and file edits.
export type AgentToolCallKind = "questdb" | "review" | "lookup" | "own"

// Agents join the server and tool names differently: mcp__questdb_console__x
// (Claude Code), mcp.questdb_console.x (Codex), questdb_console_x (OpenCode).
const QUESTDB_TOOL_PATTERN = /questdb_console(?:__|\.|_)([a-z_]+)/
// Cursor titles every MCP call "MCP: …" without the server's name. The bridge
// gives it no MCP server but QuestDB's, and the console shows the call's own
// status, so the step itself is not shown.
const CURSOR_MCP_TITLE_PATTERN = /^MCP:\s/
const TOOL_LOOKUP_PATTERN = /^tool_search\b/

const GUARDIAN_REVIEW_ID_PREFIX = "guardian_assessment:"

// The console tool a QuestDB tool call runs, like get_tables.
export const questdbToolName = (toolCall: AgentToolCall): string | null =>
  QUESTDB_TOOL_PATTERN.exec(`${toolCall.name ?? ""} ${toolCall.title}`)?.[1] ??
  null

export const classifyAgentToolCall = (
  toolCall: AgentToolCall,
): AgentToolCallKind => {
  if (toolCall.toolCallId.startsWith(GUARDIAN_REVIEW_ID_PREFIX)) {
    return "review"
  }
  if (
    TOOL_LOOKUP_PATTERN.test(toolCall.name ?? "") ||
    TOOL_LOOKUP_PATTERN.test(toolCall.title)
  ) {
    return "lookup"
  }
  return QUESTDB_TOOL_PATTERN.test(
    `${toolCall.name ?? ""} ${toolCall.title}`,
  ) || CURSOR_MCP_TITLE_PATTERN.test(toolCall.title)
    ? "questdb"
    : "own"
}
