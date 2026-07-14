// Shared so the pill and popover never drift — both must render the
// same tone for a given `MCPBridgeProvider` state.

import type { MCPBridgeClientStatus } from "../../../utils/mcp/MCPBridgeClient"
import type { BridgeVersionMismatch } from "../../../utils/mcp/protocolVersion"

export type Tone = "connected" | "connecting" | "error" | "warning" | "idle"

export const hexToRgba = (hex: string, alpha: number) => {
  const value = hex.replace("#", "")
  const r = parseInt(value.slice(0, 2), 16)
  const g = parseInt(value.slice(2, 4), 16)
  const b = parseInt(value.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export const accentColor = (tone: Tone) =>
  tone === "connected"
    ? "green"
    : tone === "connecting"
      ? "pinkPrimary"
      : tone === "error"
        ? "red"
        : tone === "warning"
          ? "orange"
          : "gray2"

export const deriveTone = (
  paired: boolean,
  status: MCPBridgeClientStatus,
  versionMismatch: BridgeVersionMismatch | null,
): Tone => {
  // A major mismatch is a terminal error, never neutral — surface it ahead of
  // the idle check so the pill stays danger even after the creds are cleared.
  if (versionMismatch === "major") return "error"
  if (!paired) return "idle"
  if (status === "connected") {
    return versionMismatch === "minor" ? "warning" : "connected"
  }
  if (status === "connecting" || status === "reconnecting") return "connecting"
  return "error"
}
