// Wire-protocol types for the MCP Bridge WebSocket — must stay in sync
// with the bridge's own types. The `v` field on every frame carries the
// bridge semver; same-major drift is tolerated, different majors hard-
// reject with close 4004.

import type { Permissions } from "../tools/permissions"

export type ToolSchema = {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export type ToolContent = {
  type: "text"
  text: string
}

export type ToolResultPayload = {
  content: ToolContent[]
  isError?: boolean
}

// browser → bridge on connect (carries the live notebook + meta tool schemas).
export type HelloMessage = {
  v: string
  type: "hello"
  token: string
  userAgent: string
  // Bridge semver this UI build was tested against. Major mismatch → 4004
  // close; same-major drift → connect + warning via wait_for_pairing.
  expectedBridgeVersion: string
  consoleOrigin: string
  tools: ToolSchema[]
  // Always present — bridge requires it; provider seeds from localStorage
  // (DEFAULT_GRANTED for new pairs) so a hello never lacks them.
  permissions: Permissions
}

// bridge → browser, ack of hello with session metadata.
export type HelloAckMessage = {
  v: string
  type: "hello_ack"
  sessionId: string
  heartbeatIntervalMs: number
  // Count only — bridge does NOT validate or filter; don't treat as a
  // "schemas accepted" signal.
  seenToolCount: number
}

// bridge → browser, forwarded MCP tool call.
export type ToolCallMessage = {
  v: string
  type: "tool_call"
  requestId: string
  name: string
  arguments: Record<string, unknown>
  // `null` ⇒ no deadline; positive number ⇒ cancel after N ms. Never
  // treat a literal `0` as "abort immediately" — bridge will never send it.
  deadlineMs: number | null
}

// browser → bridge, response (envelope mirrors `dispatchTool` output).
export type ToolResultMessage = {
  v: string
  type: "tool_result"
  requestId: string
  content: ToolContent[]
  isError?: boolean
}

// heartbeat — both directions.
export type PingMessage = {
  v: string
  type: "ping"
  nonce: string
}

export type PongMessage = {
  v: string
  type: "pong"
  nonce: string
}

// bridge → browser, cancel an in-flight tool call (deadline / agent abort).
export type CancelMessage = {
  v: string
  type: "cancel"
  requestId: string
}

// Carried in the native WS close frame's `reason` field. NOT a JSON
// envelope — browsers can't reliably deliver one on force-quit/crash/OS
// sleep, so the TCP close + heartbeat are the authoritative signals.
export type CloseReason =
  | "version_mismatch"
  | "token_invalid"
  | "superseded"
  | "browser_disconnected"
  | "tab_closing"
  | "protocol_violation"
  | "user_disconnect"

// Application-range (4000+) WS close codes. Must stay in sync with
// `mcp-bridge/src/types.ts WS_CLOSE_CODES`. Bridge originates 4001/4002/
// 4004/4005; UI may originate 4006/4007 (bridge accepts only). Origin
// rejection happens pre-upgrade at the HTTP layer (403), no close code.
export const WS_CLOSE_CODES = {
  superseded: 4001,
  token_invalid: 4002,
  major_version_mismatch: 4004,
  protocol_violation: 4005,
  user_disconnect: 4006,
  tab_closing: 4007,
} as const

export type AnyMessage =
  | HelloMessage
  | HelloAckMessage
  | ToolCallMessage
  | ToolResultMessage
  | PingMessage
  | PongMessage
  | CancelMessage
