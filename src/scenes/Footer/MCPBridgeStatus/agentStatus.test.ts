import { describe, expect, it } from "vitest"
import type { LocalAgentSnapshot } from "../../../utils/localAgent/localAgentChannel"
import { agentStatusOf } from "./agentStatus"

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

describe("agentStatusOf", () => {
  it("names the agent in every state, and never MCP", () => {
    // When
    const statuses = [
      agentStatusOf({
        agentLabel: "Claude Code",
        agent: null,
        bridgeTone: "connecting",
        versionMismatch: null,
      }),
      agentStatusOf({
        agentLabel: "Claude Code",
        agent: agent("ready"),
        bridgeTone: "connected",
        versionMismatch: null,
      }),
      agentStatusOf({
        agentLabel: "Claude Code",
        agent: agent("error", "Sign in to Claude Code."),
        bridgeTone: "connected",
        versionMismatch: null,
      }),
      agentStatusOf({
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
    const outdated = agentStatusOf({
      agentLabel: "Claude Code",
      agent: agent("ready"),
      bridgeTone: "warning",
      versionMismatch: "minor",
    })
    const unsupported = agentStatusOf({
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
