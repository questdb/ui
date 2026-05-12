// Shared so the pill and popover never drift — both must render the
// same tone for a given `MCPBridgeProvider` state.

import type { MCPBridgeClientStatus } from "../../../utils/mcp/MCPBridgeClient"

export type Tone = "connected" | "connecting" | "error" | "idle"

export const accentColor = (tone: Tone) =>
  tone === "connected"
    ? "green"
    : tone === "connecting"
      ? "pinkPrimary"
      : tone === "error"
        ? "red"
        : "gray2"

export const deriveTone = (
  paired: boolean,
  status: MCPBridgeClientStatus,
): Tone => {
  if (!paired) return "idle"
  if (status === "connected") return "connected"
  if (status === "connecting" || status === "reconnecting") return "connecting"
  return "error"
}
