import { describe, expect, it } from "vitest"
import type { LocalAgentSnapshot } from "../../../utils/localAgent/localAgentChannel"
import { mcpClientOf } from "../../../utils/mcp/mcpClients"
import { chatAgentStatusOf, mcpAgentStatusOf } from "./agentStatus"
import type { Tone } from "./tone"

const agent = (
  state: LocalAgentSnapshot["state"],
  error: string | null = null,
): LocalAgentSnapshot => ({
  info: { id: "claude", label: "Claude Code", cwd: "/work" },
  state,
  error,
  config: null,
  questions: [],
  commands: [],
  acceptsImages: false,
})

describe("chatAgentStatusOf", () => {
  it("names the agent in every state, and never MCP", () => {
    // When
    const statuses = [
      chatAgentStatusOf({
        agentLabel: "Claude Code",
        agent: null,
        bridgeTone: "connecting",
        versionMismatch: null,
      }),
      chatAgentStatusOf({
        agentLabel: "Claude Code",
        agent: agent("ready"),
        bridgeTone: "connected",
        versionMismatch: null,
      }),
      chatAgentStatusOf({
        agentLabel: "Claude Code",
        agent: agent("error", "Sign in to Claude Code."),
        bridgeTone: "connected",
        versionMismatch: null,
      }),
      chatAgentStatusOf({
        agentLabel: "Claude Code",
        agent: null,
        bridgeTone: "error",
        versionMismatch: null,
      }),
    ]

    // Then
    expect(statuses.map(({ tone, label }) => [tone, label])).toEqual([
      ["connecting", "Claude Code connecting…"],
      ["connected", "Claude Code connected"],
      ["warning", "Claude Code unavailable"],
      ["error", "Claude Code disconnected"],
    ])
    expect(statuses[2].description).toBe("Sign in to Claude Code.")
    for (const status of statuses) {
      expect(`${status.label} ${status.description}`).not.toMatch(/MCP/)
    }
  })

  it("asks to update an agent whose version this console does not support", () => {
    // When
    const outdated = chatAgentStatusOf({
      agentLabel: "Claude Code",
      agent: agent("ready"),
      bridgeTone: "warning",
      versionMismatch: "minor",
    })
    const unsupported = chatAgentStatusOf({
      agentLabel: "Claude Code",
      agent: null,
      bridgeTone: "error",
      versionMismatch: "major",
    })

    // Then
    expect(outdated).toMatchObject({
      tone: "warning",
      label: "Claude Code connected",
    })
    expect(unsupported).toMatchObject({
      tone: "error",
      label: "Claude Code needs an update",
    })
  })
})

describe("mcpAgentStatusOf", () => {
  const TONES: Tone[] = ["idle", "connecting", "connected", "warning", "error"]

  it("names a known agent in every state, says where the user talks to it, and never says MCP", () => {
    // When
    const statuses = TONES.map((tone) =>
      mcpAgentStatusOf({
        tone,
        client: mcpClientOf("claude-code"),
        versionMismatch: null,
      }),
    )

    // Then
    expect(statuses.map(({ label }) => label)).toEqual([
      "Connect agent",
      "Claude Code connecting…",
      "Claude Code connected",
      "Claude Code connected",
      "Claude Code disconnected",
    ])
    expect(statuses[2].description).toBe(
      "Claude Code works from your terminal.",
    )
    expect(statuses[4].description).toBe("Claude Code is no longer connected.")
    for (const status of statuses) {
      expect(`${status.label} ${status.description}`).not.toMatch(
        /MCP|WebSocket|bridge|pair/i,
      )
    }
  })

  it("says Agent in a label and your agent in a sentence when it does not know the agent", () => {
    // When
    const connected = mcpAgentStatusOf({
      tone: "connected",
      client: null,
      versionMismatch: null,
    })
    const connecting = mcpAgentStatusOf({
      tone: "connecting",
      client: null,
      versionMismatch: null,
    })

    // Then
    expect(connected).toEqual({
      tone: "connected",
      label: "Agent connected",
      description: "Your agent works from your terminal.",
    })
    expect(connecting.description).toBe("Connecting to your agent.")
  })

  it("asks to update an agent whose version this console does not support", () => {
    // When
    const unsupported = mcpAgentStatusOf({
      tone: "error",
      client: mcpClientOf("codex-mcp-client"),
      versionMismatch: "major",
    })

    // Then
    expect(unsupported).toEqual({
      tone: "error",
      label: "Codex needs an update",
      description: "Codex runs a version this console does not support.",
    })
  })
})
