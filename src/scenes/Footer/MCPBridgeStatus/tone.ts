// Shared so the pill and popover never drift — both must render the
// same tone for a given `MCPBridgeProvider` state.

import type { MCPBridgeClientStatus } from "../../../utils/mcp/MCPBridgeClient"

export type Tone = "connected" | "connecting" | "error" | "idle"

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
