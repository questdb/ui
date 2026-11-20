import { writePendingPair } from "./mcpBridgeStorage"
import {
  isValidAgentCwd,
  isValidAgentLabel,
  LOCALHOST_WS_RE,
  TOKEN_RE,
} from "./pairValidation"

// Moves deep-link pair params to sessionStorage so they survive the OIDC
// redirect (which strips the URL), then scrubs the URL so reloads don't
// re-trigger pairing.

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
  const agent =
    agentLabel &&
    agentCwd &&
    isValidAgentLabel(agentLabel) &&
    isValidAgentCwd(agentCwd)
      ? { label: agentLabel, cwd: agentCwd }
      : undefined

  writePendingPair({ url, token, receivedAt: Date.now(), agent })

  // Scrub so the token doesn't end up in the user's address bar.
  params.delete("mcp-pair")
  params.delete("mcp-ws")
  params.delete("mcp-token")
  params.delete("mcp-agent")
  params.delete("mcp-agent-cwd")
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
