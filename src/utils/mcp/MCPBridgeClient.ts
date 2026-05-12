import { EXPECTED_BRIDGE_VERSION } from "./protocolVersion"
import type { Permissions } from "../tools/permissions"
import {
  WS_CLOSE_CODES,
  type AnyMessage,
  type CancelMessage,
  type CloseReason,
  type HelloAckMessage,
  type HelloMessage,
  type PingMessage,
  type PongMessage,
  type ToolCallMessage,
  type ToolResultMessage,
  type ToolSchema,
} from "./types"

// These close codes will never resolve without user action — reconnecting
// just burns retries.
const TERMINAL_BRIDGE_CLOSE_CODES = new Set<number>([
  WS_CLOSE_CODES.superseded,
  WS_CLOSE_CODES.token_invalid,
  WS_CLOSE_CODES.major_version_mismatch,
])

const terminalCloseMessage = (code: number, reason: string): string => {
  if (code === WS_CLOSE_CODES.superseded) {
    return "Another browser tab is paired with this bridge. Disconnect the other tab or pair this one via a fresh link."
  }
  if (code === WS_CLOSE_CODES.token_invalid) {
    return "Pairing token is no longer valid — the bridge likely restarted. Re-pair via a fresh deep link."
  }
  if (code === WS_CLOSE_CODES.major_version_mismatch) {
    return (
      `Bridge major version doesn't match what this console expects (${EXPECTED_BRIDGE_VERSION}). ` +
      `Install a compatible bridge release, or update the console.`
    )
  }
  return reason || `Bridge closed with code ${code}.`
}

export type MCPBridgeClientStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"

type Listener<T> = (payload: T) => void

type EventMap = {
  status: MCPBridgeClientStatus
  toolCall: ToolCallMessage
  cancel: CancelMessage
  helloAck: HelloAckMessage
  latency: number
  error: Error
  retryAttempt: number
}

const HEARTBEAT_INTERVAL_MS = 5_000
const PONG_TIMEOUT_MS = 10_000
const RECONNECT_INTERVAL_MS = 3_000
const JITTER = 0.25
// Ephemeral bridge model (fresh port + token per Claude Code restart): a
// vanished bridge can't return at the same URL, so longer retries just lie
// via the status pill.
export const MAX_RECONNECT_ATTEMPTS = 5

const MAX_CONSECUTIVE_FAILED_ATTEMPTS = MAX_RECONNECT_ATTEMPTS

const monotonicNow = (): number =>
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now()

const jittered = (base: number): number => {
  const delta = base * JITTER
  return Math.round(base + (Math.random() * 2 - 1) * delta)
}

const randomNonce = (): string => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).slice(2)
}

export type MCPBridgeClientOptions = {
  url: string
  token: string
  tools: ToolSchema[]
  consoleOrigin: string
  // Mutable post-connect via `setPermissions` so silent reconnects still
  // announce the latest values to the bridge in the next hello.
  permissions: Permissions
  lastSessionId?: string
  // Test seam — defaults to global WebSocket. Lets unit tests inject a fake.
  websocketFactory?: (url: string) => WebSocket
}

export class MCPBridgeClient {
  private readonly opts: MCPBridgeClientOptions
  private permissions: Permissions
  private ws: WebSocket | null = null
  private _status: MCPBridgeClientStatus = "disconnected"
  private _latencyMs: number | null = null
  private listeners = new Map<
    keyof EventMap,
    Set<Listener<EventMap[keyof EventMap]>>
  >()
  private pendingResults: ToolResultMessage[] = []
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private pongTimer: ReturnType<typeof setTimeout> | null = null
  private outstandingPing: { nonce: string; sentAt: number } | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private explicitlyClosed = false
  private _consecutiveFailedAttempts = 0
  private get consecutiveFailedAttempts(): number {
    return this._consecutiveFailedAttempts
  }
  // Setter so every mutation also fires retryAttempt without a separate emit call.
  private set consecutiveFailedAttempts(next: number) {
    if (this._consecutiveFailedAttempts === next) return
    this._consecutiveFailedAttempts = next
    this.emit("retryAttempt", next)
  }
  private onVisibilityChange: (() => void) | null = null

  constructor(opts: MCPBridgeClientOptions) {
    this.opts = opts
    this.permissions = opts.permissions
  }

  // No push over the open WS — bridge sees changes on the next hello frame;
  // runtime informing rides the dispatcher dirty notice.
  setPermissions(next: Permissions): void {
    this.permissions = next
  }

  get status(): MCPBridgeClientStatus {
    return this._status
  }

  get latencyMs(): number | null {
    return this._latencyMs
  }

  on<K extends keyof EventMap>(
    event: K,
    handler: Listener<EventMap[K]>,
  ): () => void {
    let bag = this.listeners.get(event)
    if (!bag) {
      bag = new Set()
      this.listeners.set(event, bag)
    }
    bag.add(handler as Listener<EventMap[keyof EventMap]>)
    return () => bag?.delete(handler as Listener<EventMap[keyof EventMap]>)
  }

  private emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const bag = this.listeners.get(event)
    if (!bag) return
    for (const fn of Array.from(bag)) {
      try {
        ;(fn as Listener<EventMap[K]>)(payload)
      } catch {
        // One bad handler must not break the others.
      }
    }
  }

  private setStatus(next: MCPBridgeClientStatus): void {
    if (this._status === next) return
    this._status = next
    this.emit("status", next)
  }

  connect(): void {
    this.explicitlyClosed = false
    this.attachVisibilityListener()
    this.openSocket()
  }

  disconnect(reason: CloseReason = "user_disconnect"): void {
    this.explicitlyClosed = true
    this.cancelReconnect()
    this.stopHeartbeat()
    this.detachVisibilityListener()
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) {
      try {
        this.ws.close(1000, reason)
      } catch {
        // Some envs throw on double-close.
      }
    }
    this.ws = null
    this.pendingResults = []
    this.setStatus("disconnected")
  }

  sendToolResult(msg: ToolResultMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.send(msg)
      return
    }
    this.pendingResults.push(msg)
  }

  private buildSocketUrl(): string {
    // The bridge validates ?token=… on the WS upgrade BEFORE hello,
    // so the URL must carry it even though hello also echoes the value.
    const base = this.opts.url
    const sep = base.includes("?") ? "&" : "?"
    return `${base}${sep}token=${encodeURIComponent(this.opts.token)}`
  }

  private openSocket(): void {
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) return
    this.setStatus(
      this._status === "reconnecting" ? "reconnecting" : "connecting",
    )
    // Never log the URL — the query string carries the auth token.
    const fullUrl = this.buildSocketUrl()
    const factory =
      this.opts.websocketFactory ?? ((u: string) => new WebSocket(u))
    let socket: WebSocket
    try {
      socket = factory(fullUrl)
    } catch (err) {
      console.error("[MCPBridgeClient] WebSocket constructor threw:", err)
      this.emit(
        "error",
        err instanceof Error ? err : new Error("WebSocket constructor failed"),
      )
      this.scheduleReconnect()
      return
    }
    this.ws = socket
    socket.addEventListener("open", this.onOpen)
    socket.addEventListener("message", this.onMessage)
    socket.addEventListener("close", this.onClose)
    socket.addEventListener("error", this.onError)
  }

  private onOpen = (): void => {
    // Never log the token, not even a prefix — 4 bytes is enough to
    // confirm an exfiltrated token if a leak appears elsewhere.
    const hello: HelloMessage = {
      v: EXPECTED_BRIDGE_VERSION,
      type: "hello",
      token: this.opts.token,
      userAgent:
        typeof navigator !== "undefined" ? navigator.userAgent : "node",
      expectedBridgeVersion: EXPECTED_BRIDGE_VERSION,
      consoleOrigin: this.opts.consoleOrigin,
      tools: this.opts.tools,
      permissions: this.permissions,
    }
    this.send(hello)
    // Stay in `connecting`/`reconnecting` until the bridge acks — consumers
    // must not treat the session as usable before hello_ack.
  }

  private onMessage = (ev: MessageEvent): void => {
    let parsed: AnyMessage
    try {
      parsed =
        typeof ev.data === "string"
          ? (JSON.parse(ev.data) as AnyMessage)
          : (JSON.parse(String(ev.data)) as AnyMessage)
    } catch {
      // Forward-compat: tolerate malformed frames; let the bridge close us
      // with `protocol_violation` if it cares.
      return
    }
    if (typeof parsed !== "object" || parsed === null) return
    // No strict `v` equality: `v` carries bridge semver; same-major drift
    // is tolerated, major mismatches arrive as close code 4004.
    switch (parsed.type) {
      case "hello_ack":
        this.handleHelloAck(parsed)
        return
      case "tool_call":
        this.emit("toolCall", parsed)
        return
      case "cancel":
        this.emit("cancel", parsed)
        return
      case "ping":
        this.send({
          v: EXPECTED_BRIDGE_VERSION,
          type: "pong",
          nonce: parsed.nonce,
        } satisfies PongMessage)
        return
      case "pong":
        this.handlePong(parsed)
        return
      default:
        return
    }
  }

  private onClose = (ev?: unknown): void => {
    const code = (ev as { code?: number } | undefined)?.code ?? 0
    const reason = (ev as { reason?: string } | undefined)?.reason ?? ""
    // eslint-disable-next-line no-console
    console.log("[MCPBridgeClient] WS close event:", {
      code,
      reason,
      wasClean: (ev as { wasClean?: boolean } | undefined)?.wasClean,
    })
    this.stopHeartbeat()
    this.ws = null
    if (this.explicitlyClosed) {
      this.setStatus("disconnected")
      return
    }
    // Stop retrying and mark explicitlyClosed so the visibility listener
    // doesn't resurrect the loop on tab focus — only a fresh deep-link
    // re-pair can recover from these codes.
    if (TERMINAL_BRIDGE_CLOSE_CODES.has(code)) {
      this.cancelReconnect()
      this.explicitlyClosed = true
      this.emit("error", new Error(terminalCloseMessage(code, reason)))
      this.setStatus("disconnected")
      return
    }
    this.scheduleReconnect()
  }

  private onError = (ev?: unknown): void => {
    console.error("[MCPBridgeClient] WS error event:", ev)
    // Detail surfaces via the close event that follows.
  }

  private handleHelloAck(msg: HelloAckMessage): void {
    this.consecutiveFailedAttempts = 0
    this.setStatus("connected")
    this.emit("helloAck", msg)
    if (this.pendingResults.length > 0) {
      const flushing = this.pendingResults
      this.pendingResults = []
      for (const m of flushing) this.send(m)
    }
    this.startHeartbeat(msg.heartbeatIntervalMs ?? HEARTBEAT_INTERVAL_MS)
  }

  private handlePong(msg: PongMessage): void {
    if (!this.outstandingPing || this.outstandingPing.nonce !== msg.nonce) {
      return
    }
    const rtt = monotonicNow() - this.outstandingPing.sentAt
    this._latencyMs = rtt
    this.emit("latency", rtt)
    this.outstandingPing = null
    if (this.pongTimer) {
      clearTimeout(this.pongTimer)
      this.pongTimer = null
    }
  }

  private startHeartbeat(intervalMs: number): void {
    this.stopHeartbeat()
    this.heartbeatTimer = setInterval(() => this.sendPing(), intervalMs)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
    if (this.pongTimer) {
      clearTimeout(this.pongTimer)
      this.pongTimer = null
    }
    this.outstandingPing = null
  }

  private sendPing(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
    if (this.outstandingPing) {
      // Previous pong never came; force-terminate to fall into reconnect.
      this.terminateAndReconnect()
      return
    }
    const nonce = randomNonce()
    const sentAt = monotonicNow()
    this.outstandingPing = { nonce, sentAt }
    this.send({
      v: EXPECTED_BRIDGE_VERSION,
      type: "ping",
      nonce,
    } satisfies PingMessage)
    this.pongTimer = setTimeout(() => {
      this.terminateAndReconnect()
    }, PONG_TIMEOUT_MS)
  }

  private terminateAndReconnect(): void {
    if (!this.ws) return
    try {
      // Browsers reject close codes outside 1000 and 3000-4999 with
      // InvalidAccessError, leaving the WS OPEN and looping until the
      // peer's pong-timeout fires. 4005 (protocol_violation) is in range.
      this.ws.close(WS_CLOSE_CODES.protocol_violation, "pong_timeout")
    } catch {
      // close handler will still run.
    }
  }

  private scheduleReconnect(): void {
    if (this.explicitlyClosed) return
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.consecutiveFailedAttempts += 1
    if (this.consecutiveFailedAttempts > MAX_CONSECUTIVE_FAILED_ATTEMPTS) {
      this.setStatus("disconnected")
      return
    }
    this.setStatus("reconnecting")
    const delay = jittered(RECONNECT_INTERVAL_MS)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.openSocket()
    }, delay)
  }

  private cancelReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.consecutiveFailedAttempts = 0
  }

  // Background tabs throttle setInterval/setTimeout, so foregrounding
  // the tab triggers an immediate retry instead of waiting up to several
  // seconds for the scheduled one.
  private attachVisibilityListener(): void {
    if (typeof document === "undefined" || this.onVisibilityChange) return
    const handler = (): void => {
      if (document.visibilityState !== "visible") return
      if (this.explicitlyClosed) return
      if (this._status === "connected" || this._status === "connecting") return
      // Don't resurrect a gave-up session on tab focus — the user must
      // click "Try again" to opt back in.
      if (this.consecutiveFailedAttempts > MAX_CONSECUTIVE_FAILED_ATTEMPTS) {
        return
      }
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer)
        this.reconnectTimer = null
      }
      // Wake-from-sleep deserves a fresh retry budget.
      this.consecutiveFailedAttempts = 0
      this.openSocket()
    }
    document.addEventListener("visibilitychange", handler)
    this.onVisibilityChange = handler
  }

  private detachVisibilityListener(): void {
    if (typeof document === "undefined" || !this.onVisibilityChange) return
    document.removeEventListener("visibilitychange", this.onVisibilityChange)
    this.onVisibilityChange = null
  }

  private send(msg: AnyMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn(
        "[MCPBridgeClient] send dropped — ws not OPEN, type =",
        msg.type,
        "readyState =",
        this.ws?.readyState,
      )
      return
    }
    try {
      this.ws.send(JSON.stringify(msg))
    } catch (err) {
      console.error("[MCPBridgeClient] send threw:", err)
      this.emit(
        "error",
        err instanceof Error ? err : new Error("WebSocket send failed"),
      )
    }
  }
}
