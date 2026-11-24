import {
  EXPECTED_MCP_VERSION,
  MCP_PACKAGE,
} from "../../utils/mcp/protocolVersion"

export const MCP_RELEASES_URL =
  "https://github.com/questdb/mcp-server-questdb/releases"

export type CommandChannel = "npx" | "standalone"

// The console's own address: a console can be served under a path.
export const consoleUrlOf = ({
  origin,
  pathname,
}: Pick<Location, "origin" | "pathname">): string =>
  `${origin}${pathname.replace(/\/(index\.html)?$/, "")}`

export const connectCommandOf = (
  consoleUrl: string,
  channel: CommandChannel,
): string =>
  channel === "npx"
    ? `npx ${MCP_PACKAGE}@${EXPECTED_MCP_VERSION} connect ${consoleUrl}`
    : `node mcp-server-questdb-${EXPECTED_MCP_VERSION}.mjs connect ${consoleUrl}`
