// Bridge semver this console build was verified against. Stamped on every
// WS frame as `v` and echoed in `hello.expectedBridgeVersion`. Bridge
// compares same-major (connect + warning) vs different-major (close 4004).
// Bump in lockstep with verified bridge releases.
export const EXPECTED_BRIDGE_VERSION = "0.2.0"

export type BridgeVersionMismatch = "major" | "minor"

export const BRIDGE_UPGRADE_COMMAND = `npx @questdb/mcp-bridge@${EXPECTED_BRIDGE_VERSION} upgrade`

export const BRIDGE_SETUP_COMMAND = `npx @questdb/mcp-bridge@${EXPECTED_BRIDGE_VERSION} setup`

export const BRIDGE_VERSION_MISMATCH_COPY: Record<
  BridgeVersionMismatch,
  { title: string; message: string }
> = {
  major: {
    title: "MCP bridge version mismatch",
    message:
      `This MCP bridge is incompatible with what this console expects (${EXPECTED_BRIDGE_VERSION}). ` +
      `Upgrade your bridge with the following command and re-pair:`,
  },
  minor: {
    title: "Update your MCP bridge",
    message:
      `Connected successfully, but the bridge version doesn't match what this console expects ` +
      `(${EXPECTED_BRIDGE_VERSION}). Some tools may not work as intended until you upgrade. ` +
      `Run this command and re-pair:`,
  },
}

const parseSemver = (version: string): [number, number, number] | null => {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version.trim())
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

export const isBridgeVersionMismatch = (bridgeVersion: string): boolean => {
  const bridge = parseSemver(bridgeVersion)
  const expected = parseSemver(EXPECTED_BRIDGE_VERSION)
  if (!bridge || !expected) return false
  return (
    bridge[0] !== expected[0] ||
    bridge[1] !== expected[1] ||
    bridge[2] !== expected[2]
  )
}
