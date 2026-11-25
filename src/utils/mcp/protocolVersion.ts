// MCP server semver this console build was verified against. Stamped on every
// WS frame as `v` and echoed in `hello.expectedBridgeVersion`. Bridge
// compares same-major (connect + warning) vs different-major (close 4004).
// Bump in lockstep with verified bridge releases.
export const EXPECTED_MCP_VERSION = "0.6.0"

export type BridgeVersionMismatch = "major" | "minor"

export const MCP_PACKAGE = "@questdb/mcp-server-questdb"

export const MCP_UPGRADE_COMMAND = `npx ${MCP_PACKAGE}@${EXPECTED_MCP_VERSION} upgrade`

export const MCP_SETUP_COMMAND = `npx ${MCP_PACKAGE}@${EXPECTED_MCP_VERSION} setup`

// MCP mode copy. The bridge is part of the user's coding agent setup, so the
// copy names the agent: "Claude Code", or "your coding agent" when unknown.
export const mcpVersionMismatchCopy = (
  severity: BridgeVersionMismatch,
  agent: { subject: string; inline: string },
): { title: string; message: string } =>
  severity === "major"
    ? {
        title: "Update required",
        message:
          `This console expects ${EXPECTED_MCP_VERSION}. Run this command, ` +
          `restart ${agent.inline}, then connect again:`,
      }
    : {
        title: "Update recommended",
        message:
          `This console expects ${EXPECTED_MCP_VERSION}. Some tools may not ` +
          `work until you update. Run this command, then restart ${agent.inline}:`,
      }

const parseSemver = (version: string): [number, number, number] | null => {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version.trim())
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

export const isBridgeVersionMismatch = (bridgeVersion: string): boolean => {
  const bridge = parseSemver(bridgeVersion)
  const expected = parseSemver(EXPECTED_MCP_VERSION)
  if (!bridge || !expected) return false
  return (
    bridge[0] !== expected[0] ||
    bridge[1] !== expected[1] ||
    bridge[2] !== expected[2]
  )
}
