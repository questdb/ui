import { writePendingPair } from "./mcpBridgeStorage"
import {
  agentCwdForDisplay,
  agentLabelForDisplay,
  LOCALHOST_WS_RE,
  TOKEN_RE,
} from "./pairValidation"

// Moves deep-link pair params to sessionStorage so they survive the OIDC
// redirect (which strips the URL), then scrubs the URL so reloads don't
// re-trigger pairing.

// The MCP server sends at most 64 characters; cut anything longer.
const MAX_MCP_CLIENT_NAME = 64

export type PendingPairOutcome =
  | { kind: "consumed" }
  | { kind: "no_params" }
  | {
      kind: "rejected"
      reason: "invalid_ws" | "invalid_token" | "missing_field"
    }

export const consumePendingPairFromUrl = (
  loc: { search: string; pathname: string; hash: string } = window.location,
  history: {
    replaceState: (s: unknown, t: string, url: string) => void
  } = window.history,
): PendingPairOutcome => {
  const params = new URLSearchParams(loc.search)
  if (params.get("mcp-pair") !== "1") return { kind: "no_params" }

  const url = params.get("mcp-ws")
  const token = params.get("mcp-token")

  if (!url || !token) {
    return { kind: "rejected", reason: "missing_field" }
  }
  if (!LOCALHOST_WS_RE.test(url)) {
    return { kind: "rejected", reason: "invalid_ws" }
  }
  if (!TOKEN_RE.test(token)) {
    return { kind: "rejected", reason: "invalid_token" }
  }

  const agentLabel = params.get("mcp-agent")
  const agentCwd = params.get("mcp-agent-cwd")
  // Either parameter marks an agent bridge, so the dialog always warns that
  // the agent runs commands, even when a value has to be cleaned or cut.
  const agent =
    agentLabel !== null || agentCwd !== null
      ? {
          label: agentLabelForDisplay(agentLabel ?? ""),
          cwd: agentCwdForDisplay(agentCwd ?? ""),
        }
      : undefined

  // MCP mode names its coding agent separately; `mcp-agent` means chat mode.
  const mcpClient = agent
    ? undefined
    : params.get("mcp-client")?.trim().slice(0, MAX_MCP_CLIENT_NAME) ||
      undefined

  writePendingPair({ url, token, receivedAt: Date.now(), agent, mcpClient })

  // Scrub so the token doesn't end up in the user's address bar.
  params.delete("mcp-pair")
  params.delete("mcp-ws")
  params.delete("mcp-token")
  params.delete("mcp-agent")
  params.delete("mcp-agent-cwd")
  params.delete("mcp-client")
  const remaining = params.toString()
  const cleanUrl =
    loc.pathname + (remaining ? `?${remaining}` : "") + (loc.hash || "")
  try {
    history.replaceState(null, "", cleanUrl)
  } catch {
    // Some embeddings restrict history.
  }
  return { kind: "consumed" }
}
