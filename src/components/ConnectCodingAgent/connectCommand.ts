import {
  EXPECTED_MCP_VERSION,
  MCP_PACKAGE,
} from "../../utils/mcp/protocolVersion"
import { CHAT_AGENTS } from "../../utils/localAgent/chatAgents"

export const MCP_RELEASES_URL =
  "https://github.com/questdb/mcp-server-questdb/releases"

export type CommandChannel = "npx" | "standalone"

// The console's own address: a console can be served under a path.
export const consoleUrlOf = ({
  origin,
  pathname,
}: Pick<Location, "origin" | "pathname">): string =>
  `${origin}${pathname.replace(/\/(index\.html)?$/, "")}`

// `agentId` names the agent to run, when the console knows it. Without it,
// `connect` asks in the terminal. Ids `connect` does not know (a custom
// agent has no preset) are left out too.
export const connectCommandOf = (
  consoleUrl: string,
  channel: CommandChannel,
  agentId: string | null = null,
): string => {
  const launch =
    channel === "npx"
      ? `npx ${MCP_PACKAGE}@${EXPECTED_MCP_VERSION}`
      : `node mcp-server-questdb-${EXPECTED_MCP_VERSION}.mjs`
  const known = CHAT_AGENTS.some((agent) => agent.id === agentId)
  const agent = known ? ` --agent ${agentId}` : ""
  return `${launch} connect ${consoleUrl}${agent}`
}
