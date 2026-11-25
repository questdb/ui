// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react"
import { expect, it, vi } from "vitest"
import type { MCPBridgeClient } from "../../utils/mcp/MCPBridgeClient"
import type { HelloAckMessage } from "../../utils/mcp/types"
import type {
  AgentInboundMessage,
  AgentOutboundMessage,
} from "../../utils/localAgent/protocol"
import { EXPECTED_MCP_VERSION } from "../../utils/mcp/protocolVersion"
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
    (settings) => useLocalAgentConnection({ aiAssistantSettings: settings }),
    { initialProps: initial },
  )
  const sent: AgentInboundMessage[] = []
  const listeners = new Map<string, (payload: unknown) => void>()
  let online = false
  const client = {
    on(event: string, handler: (payload: unknown) => void) {
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
      const ack: Partial<HelloAckMessage> = {
        agent: { id: "agent", label: "Local agent", cwd: "/tmp/workspace" },
      }
      listeners.get("helloAck")?.(ack)
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
    giveUp: () =>
      act(() => {
        online = false
        listeners.get("status")?.("disconnected")
      }),
    receive: (frame: AgentOutboundMessage) =>
      act(() => {
        listeners.get("agentMessage")?.(frame)
      }),
    client,
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

it("stops the turn a channel left running when its bridge comes back after the console gave up", () => {
  const bridge = attachBridge()
  try {
    // Given a running turn
    void bridge.result.current.channel?.prompt({
      conversationId: "c1",
      text: "Summarize a sample",
      notebookRead: null,
      onUpdate: vi.fn(),
      onToolStatus: vi.fn(),
    })
    const prompt = bridge.sent.find((frame) => frame.type === "agent_prompt")

    // When the console gives up on the bridge, then the bridge comes back
    bridge.giveUp()
    bridge.reconnect()

    // Then the new channel stops the turn, and aborts the tools it calls
    const channel = bridge.result.current.channel
    expect(
      bridge.sent.filter((frame) => frame.type === "agent_cancel"),
    ).toEqual([expect.objectContaining({ conversationId: "c1" })])
    expect(
      channel?.captureToolRequest(bridge.client, "c1")?.signal.aborted,
    ).toBe(true)
    bridge.receive({
      v: EXPECTED_MCP_VERSION,
      type: "agent_turn_end",
      conversationId: "c1",
      turnId: prompt?.type === "agent_prompt" ? prompt.turnId : "",
      result: { outcome: "completed", stopReason: "cancelled", usage: null },
    })
    expect(channel?.captureToolRequest(bridge.client, "c1")).toBeUndefined()
  } finally {
    bridge.detach()
  }
})
