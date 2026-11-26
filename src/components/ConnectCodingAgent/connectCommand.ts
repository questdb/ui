import {
  EXPECTED_MCP_VERSION,
  MCP_PACKAGE,
} from "../../utils/mcp/protocolVersion"
import { CHAT_AGENTS } from "../../utils/localAgent/chatAgents"

export const MCP_RELEASES_URL =
  "https://github.com/questdb/mcp-server-questdb/releases"

export type CommandChannel = "npx" | "standalone"

const percentEscapesOf = (char: string): string =>
  Array.from(
    new TextEncoder().encode(char),
    (byte) => `%${byte.toString(16).toUpperCase().padStart(2, "0")}`,
  ).join("")

// The console's own address: a console can be served under a path. The
// path comes from the link the user opened, and the command is pasted
// into a shell, so the path keeps only letters, digits, `/ . _ -` and the
// `%` of the escapes the browser made; every other character (a
// surrogate pair is one) is written as the escapes of its UTF-8 bytes.
// The same page opens, and no shell reads the address as more than one
// plain word.
export const consoleUrlOf = ({
  origin,
  pathname,
}: Pick<Location, "origin" | "pathname">): string =>
  `${origin}${pathname
    .replace(/\/(index\.html)?$/, "")
    .replace(
      /[\uD800-\uDBFF][\uDC00-\uDFFF]|[^A-Za-z0-9/._%-]/g,
      percentEscapesOf,
    )}`

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
