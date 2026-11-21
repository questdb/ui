// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react"
import { expect, it, vi } from "vitest"
import type { MCPBridgeClient } from "../../utils/mcp/MCPBridgeClient"
import type { HelloAckMessage } from "../../utils/mcp/types"
import type { AgentInboundMessage } from "../../utils/localAgent/protocol"
import { withLocalAgentPreferences } from "../../utils/localAgent/localAgentSettings"
import { DEFAULT_AI_ASSISTANT_SETTINGS } from "../LocalStorageProvider"
import { useLocalAgentConnection } from "./useLocalAgentConnection"

vi.mock("../../modules/ConsoleEventTracker", () => ({ trackEvent: vi.fn() }))

const attachBridge = () => {
  const initial = withLocalAgentPreferences(
    DEFAULT_AI_ASSISTANT_SETTINGS,
    "agent",
    { model: "model-a" },
  )
  const hook = renderHook(
    (settings) =>
      useLocalAgentConnection({
        isEnabled: true,
        aiAssistantSettings: settings,
      }),
    { initialProps: initial },
  )
  const sent: AgentInboundMessage[] = []
  const listeners = new Map<string, (ack: Partial<HelloAckMessage>) => void>()
  let online = false
  const client = {
    on(event: string, handler: (ack: Partial<HelloAckMessage>) => void) {
      listeners.set(event, handler)
      return () => listeners.delete(event)
    },
    sendAgentMessage(frame: AgentInboundMessage) {
      if (!online) return false
      sent.push(frame)
      return true
    },
  } as unknown as MCPBridgeClient
  const detach = hook.result.current.attachClient(client)
  const reconnect = () =>
    act(() => {
      online = true
      listeners.get("helloAck")?.({
        agent: { id: "agent", label: "Local agent", cwd: "/tmp/workspace" },
      })
    })
  reconnect()
  return {
    ...hook,
    initial,
    reconnect,
    sent,
    detach: () => act(detach),
    pause: () => {
      online = false
    },
  }
}

it("resends the latest preferences when the same bridge reconnects", () => {
  const bridge = attachBridge()
  try {
    expect(bridge.sent).toEqual([
      expect.objectContaining({ type: "agent_settings", model: "model-a" }),
    ])
    const originalChannel = bridge.result.current.channel
    bridge.pause()
    bridge.rerender(
      withLocalAgentPreferences(bridge.initial, "agent", { model: "model-b" }),
    )
    bridge.reconnect()

    expect(bridge.result.current.channel).toBe(originalChannel)
    expect(bridge.sent.at(-1)).toMatchObject({
      type: "agent_settings",
      model: "model-b",
    })
  } finally {
    bridge.detach()
  }
})

it("delivers Stop after a brief bridge interruption", () => {
  const bridge = attachBridge()
  try {
    const controller = new AbortController()
    void bridge.result.current.channel?.prompt({
      conversationId: "c1",
      text: "Summarize a sample",
      notebookRead: null,
      signal: controller.signal,
      onUpdate: vi.fn(),
      onToolStatus: vi.fn(),
    })
    bridge.pause()
    controller.abort()
    expect(bridge.sent.map((frame) => frame.type)).not.toContain("agent_cancel")
    bridge.reconnect()

    expect(
      bridge.sent.filter((frame) => frame.type === "agent_cancel"),
    ).toEqual([expect.objectContaining({ conversationId: "c1" })])
  } finally {
    bridge.detach()
  }
})
