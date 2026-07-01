import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { MCPBridgeClient } from "./MCPBridgeClient"
import { EXPECTED_BRIDGE_VERSION } from "./protocolVersion"
import { WS_CLOSE_CODES, type HelloMessage, type ToolSchema } from "./types"

// A version within the same major as expected — drifted enough to read as a
// mismatch, yet never equal to EXPECTED_BRIDGE_VERSION whatever it's bumped to.
const [expectedMajor, expectedMinor, expectedPatch] =
  EXPECTED_BRIDGE_VERSION.split(".").map(Number)
const SAME_MAJOR_DRIFT = `${expectedMajor}.${expectedMinor + 1}.${expectedPatch}`

class FakeWebSocket {
  static OPEN_CONSTANT = 1
  readyState = 0
  sent: string[] = []
  url: string
  private listeners: Record<string, Set<(ev: unknown) => void>> = {}
  static get OPEN() {
    return FakeWebSocket.OPEN_CONSTANT
  }
  constructor(url: string) {
    this.url = url
  }
  addEventListener(type: string, listener: (ev: unknown) => void) {
    let bag = this.listeners[type]
    if (!bag) {
      bag = new Set()
      this.listeners[type] = bag
    }
    bag.add(listener)
  }
  send(data: string) {
    if (this.readyState !== FakeWebSocket.OPEN_CONSTANT) {
      throw new Error("send while not open")
    }
    this.sent.push(data)
  }
  close(_code?: number, _reason?: string) {
    this.lastCloseArgs = { code: _code, reason: _reason }
    if (this.readyState === 3) return
    this.readyState = 3
    this.dispatch("close", { code: _code ?? 1006, reason: _reason ?? "" })
  }
  open() {
    this.readyState = FakeWebSocket.OPEN_CONSTANT
    this.dispatch("open", {})
  }
  receive(payload: unknown) {
    this.dispatch("message", { data: JSON.stringify(payload) })
  }
  dropFromServer(code: number = 1006, reason: string = "") {
    this.readyState = 3
    this.dispatch("close", { code, reason })
  }
  // Lets tests assert the close() code chosen (e.g. JS-legal 4005 vs the
  // spec-forbidden 1006).
  lastCloseArgs: { code?: number; reason?: string } | null = null
  private dispatch(type: string, ev: unknown) {
    const bag = this.listeners[type]
    if (!bag) return
    for (const fn of Array.from(bag)) fn(ev)
  }
}

beforeEach(() => {
  ;(globalThis as unknown as { WebSocket: typeof FakeWebSocket }).WebSocket =
    FakeWebSocket as unknown as typeof FakeWebSocket
})

afterEach(() => {
  vi.useRealTimers()
})

const tools: ToolSchema[] = [
  { name: "add_cell", description: "x", inputSchema: { type: "object" } },
]

const makeClient = () => {
  let lastSocket: FakeWebSocket | null = null
  const client = new MCPBridgeClient({
    url: "ws://127.0.0.1:57123?token=t",
    token: "t",
    tools,
    consoleOrigin: "http://127.0.0.1:9000",
    permissions: { grantSchemaAccess: true, read: true, write: true },
    websocketFactory: (u) => {
      lastSocket = new FakeWebSocket(u)
      return lastSocket as unknown as WebSocket
    },
  })
  return {
    client,
    socket: () => {
      if (!lastSocket) throw new Error("socket not yet created")
      return lastSocket
    },
  }
}

const handshake = (
  client: MCPBridgeClient,
  socket: FakeWebSocket,
  sessionId = "s1",
) => {
  socket.open()
  socket.receive({
    v: EXPECTED_BRIDGE_VERSION,
    type: "hello_ack",
    sessionId,
    heartbeatIntervalMs: 5_000,
    seenToolCount: 1,
  })
  return client
}

describe("MCPBridgeClient", () => {
  it("sends hello on open and flips to connected on hello_ack", () => {
    const { client, socket } = makeClient()
    const statuses: string[] = []
    client.on("status", (s) => statuses.push(s))
    client.connect()
    expect(client.status).toBe("connecting")
    socket().open()
    expect(socket().sent.length).toBe(1)
    const hello = JSON.parse(socket().sent[0]) as HelloMessage
    expect(hello.type).toBe("hello")
    expect(hello.token).toBe("t")
    expect(hello.tools.length).toBe(1)
    expect(client.status).toBe("connecting")
    socket().receive({
      v: EXPECTED_BRIDGE_VERSION,
      type: "hello_ack",
      sessionId: "s-1",
      heartbeatIntervalMs: 5_000,
      resumed: false,
      seenToolCount: 1,
    })
    expect(client.status).toBe("connected")
    expect(statuses).toContain("connected")
  })

  it("emits toolCall events from incoming messages", () => {
    const { client, socket } = makeClient()
    const calls: string[] = []
    client.on("toolCall", (m) => calls.push(m.name))
    client.connect()
    handshake(client, socket())
    socket().receive({
      v: EXPECTED_BRIDGE_VERSION,
      type: "tool_call",
      requestId: "r1",
      name: "add_cell",
      arguments: { value: "x" },
      deadlineMs: 15000,
    })
    expect(calls).toEqual(["add_cell"])
  })

  it("responds to ping with matching pong", () => {
    const { client, socket } = makeClient()
    client.connect()
    handshake(client, socket())
    socket().sent.length = 0
    socket().receive({
      v: EXPECTED_BRIDGE_VERSION,
      type: "ping",
      nonce: "abc",
    })
    expect(socket().sent.length).toBe(1)
    const pong = JSON.parse(socket().sent[0]) as Record<string, unknown>
    expect(pong).toMatchObject({ type: "pong", nonce: "abc" })
  })

  it("ignores unknown message types (forward-compat)", () => {
    const { client, socket } = makeClient()
    client.connect()
    handshake(client, socket())
    expect(() =>
      socket().receive({
        v: EXPECTED_BRIDGE_VERSION,
        type: "future_unknown_message",
        payload: { whatever: 1 },
      }),
    ).not.toThrow()
    expect(client.status).toBe("connected")
  })

  it("accepts incoming frames regardless of `v` (major-mismatch handled via close 4004, not per-frame filtering)", () => {
    // `v` carries the bridge semver; same-major drift is tolerated. True
    // major mismatch hard-rejects at hello time via close code 4004.
    const { client, socket } = makeClient()
    const calls: string[] = []
    client.on("toolCall", (m) => calls.push(m.name))
    client.connect()
    handshake(client, socket())
    socket().receive({
      v: SAME_MAJOR_DRIFT,
      type: "tool_call",
      requestId: "r1",
      name: "add_cell",
      arguments: {},
      deadlineMs: 15_000,
    })
    expect(calls).toEqual(["add_cell"])
  })

  it("queues tool_result while disconnected and flushes on reconnect", () => {
    vi.useFakeTimers()
    const { client, socket } = makeClient()
    client.connect()
    handshake(client, socket(), "session-A")
    socket().dropFromServer()
    expect(client.status).toBe("reconnecting")
    client.sendToolResult({
      v: EXPECTED_BRIDGE_VERSION,
      type: "tool_result",
      requestId: "r1",
      content: [{ type: "text", text: "{}" }],
      isError: false,
    })
    vi.advanceTimersByTime(5000)
    // `socket()` returns the *latest* socket — the reconnect just created a
    // new one, so this is NOT the original socket from before the drop.
    handshake(client, socket(), "session-A")
    const sentTypes = socket().sent.map(
      (s) => (JSON.parse(s) as { type: string }).type,
    )
    expect(sentTypes).toContain("hello")
    expect(sentTypes).toContain("tool_result")
  })

  it("carries lastSessionId on reconnect so the bridge takes over rather than rejecting", () => {
    vi.useFakeTimers()
    const { client, socket } = makeClient()
    client.connect()
    handshake(client, socket(), "session-A")
    const firstConnectUrl = socket().url

    socket().dropFromServer()
    vi.advanceTimersByTime(5000)
    // `socket()` is now the reconnect's fresh socket; its URL is fixed at construction.
    const reconnectUrl = socket().url

    expect(firstConnectUrl).not.toContain("lastSessionId")
    expect(reconnectUrl).toContain("lastSessionId=session-A")
  })

  it("disconnect() closes the WS without sending a close frame", () => {
    const { client, socket } = makeClient()
    client.connect()
    handshake(client, socket())
    socket().sent.length = 0
    client.disconnect("user_disconnect")
    expect(client.status).toBe("disconnected")
    // No JSON close frame sent — the WS close itself is the signal.
    expect(socket().sent.length).toBe(0)
  })

  it("does not auto-reconnect after explicit disconnect()", () => {
    vi.useFakeTimers()
    const { client, socket } = makeClient()
    client.connect()
    handshake(client, socket())
    client.disconnect("user_disconnect")
    vi.advanceTimersByTime(60_000)
    expect(client.status).toBe("disconnected")
  })

  it("schedules reconnect on close at the constant interval", () => {
    vi.useFakeTimers()
    const { client, socket } = makeClient()
    client.connect()
    handshake(client, socket())
    socket().dropFromServer()
    expect(client.status).toBe("reconnecting")
    vi.advanceTimersByTime(5000)
    expect(client.status).toBe("reconnecting")
  })

  it("emits latency on pong", () => {
    vi.useFakeTimers()
    const { client, socket } = makeClient()
    const seen: number[] = []
    client.on("latency", (ms) => seen.push(ms))
    client.connect()
    handshake(client, socket())
    vi.advanceTimersByTime(5_000)
    const ping = JSON.parse(socket().sent[socket().sent.length - 1]) as {
      type: string
      nonce: string
    }
    expect(ping.type).toBe("ping")
    socket().receive({
      v: EXPECTED_BRIDGE_VERSION,
      type: "pong",
      nonce: ping.nonce,
    })
    expect(seen.length).toBe(1)
    expect(seen[0]).toBeGreaterThanOrEqual(0)
  })

  it("gives up after MAX consecutive failed reconnects (status → disconnected)", () => {
    vi.useFakeTimers()
    const { client, socket } = makeClient()
    client.connect()
    handshake(client, socket())
    socket().dropFromServer()
    expect(client.status).toBe("reconnecting")
    for (let i = 0; i < 25; i++) {
      vi.advanceTimersByTime(4_000)
      try {
        socket().dropFromServer()
      } catch {
        // No new socket created — we've given up.
      }
    }
    expect(client.status).toBe("disconnected")
  })

  it("a successful helloAck resets the give-up counter", () => {
    vi.useFakeTimers()
    const { client, socket } = makeClient()
    client.connect()
    handshake(client, socket())
    for (let i = 0; i < 5; i++) {
      socket().dropFromServer()
      vi.advanceTimersByTime(4_000)
    }
    expect(client.status).toBe("reconnecting")
    handshake(client, socket())
    expect(client.status).toBe("connected")
    // Should NOT immediately give up — counter reset by the helloAck, so we
    // have a full budget again.
    socket().dropFromServer()
    expect(client.status).toBe("reconnecting")
  })

  // Bridge-originated terminal close codes must NOT enter the reconnect
  // loop — reconnecting hits the same wall. Stop retrying and surface a
  // typed `error` so the UI can distinguish them from "bridge is dead".
  describe("terminal bridge close codes", () => {
    const cases: Array<{
      code: number
      label: string
      expectInMessage: string
    }> = [
      {
        code: WS_CLOSE_CODES.superseded,
        label: "superseded (4001)",
        expectInMessage: "Another browser tab is paired",
      },
      {
        code: WS_CLOSE_CODES.token_invalid,
        label: "token_invalid (4002)",
        expectInMessage: "token is no longer valid",
      },
      {
        code: WS_CLOSE_CODES.major_version_mismatch,
        label: "major_version_mismatch (4004)",
        expectInMessage: "incompatible with what this console expects",
      },
    ]
    for (const { code, label, expectInMessage } of cases) {
      it(`stops retrying and emits error on ${label}`, () => {
        vi.useFakeTimers()
        const { client, socket } = makeClient()
        const errors: Error[] = []
        client.on("error", (e) => errors.push(e))
        client.connect()
        handshake(client, socket())
        socket().dropFromServer(code)
        expect(client.status).toBe("disconnected")
        expect(errors.length).toBe(1)
        expect(errors[0].message).toContain(expectInMessage)
        // No scheduled retry: advancing the clock must not flip status.
        vi.advanceTimersByTime(60_000)
        expect(client.status).toBe("disconnected")
      })
    }

    it("transient close (1006) still reconnects — only bridge-terminal codes opt out", () => {
      vi.useFakeTimers()
      const { client, socket } = makeClient()
      client.connect()
      handshake(client, socket())
      socket().dropFromServer(1006)
      expect(client.status).toBe("reconnecting")
    })
  })

  describe("version mismatch signalling", () => {
    it("emits a major versionMismatch on a 4004 close", () => {
      // Given a connected client
      const { client, socket } = makeClient()
      const mismatches: Array<"major" | "minor" | null> = []
      client.on("versionMismatch", (m) => mismatches.push(m))
      client.connect()
      handshake(client, socket())
      // When the bridge hard-rejects on a major version mismatch
      socket().dropFromServer(WS_CLOSE_CODES.major_version_mismatch)
      // Then a major mismatch is signalled
      expect(mismatches).toContain("major")
    })

    it("emits a minor versionMismatch when hello_ack reports a same-major drift", () => {
      // Given a client whose expected version differs only in minor/patch
      const { client, socket } = makeClient()
      const mismatches: Array<"major" | "minor" | null> = []
      client.on("versionMismatch", (m) => mismatches.push(m))
      client.connect()
      socket().open()
      // When the bridge acks with a drifted same-major version
      socket().receive({
        v: SAME_MAJOR_DRIFT,
        type: "hello_ack",
        sessionId: "s1",
        heartbeatIntervalMs: 5_000,
        seenToolCount: 1,
      })
      // Then the client connects but flags a minor mismatch
      expect(client.status).toBe("connected")
      expect(mismatches).toEqual(["minor"])
    })

    it("emits null versionMismatch when hello_ack matches the expected version", () => {
      // Given a client connecting to a matching bridge
      const { client, socket } = makeClient()
      const mismatches: Array<"major" | "minor" | null> = []
      client.on("versionMismatch", (m) => mismatches.push(m))
      client.connect()
      // When the handshake reports the exact expected version
      handshake(client, socket())
      // Then no mismatch is flagged
      expect(mismatches).toEqual([null])
    })
  })

  it("pong-timeout closes the WS with a JS-legal app-range code (4005), not 1006", () => {
    // Browsers only permit close codes 1000 or 3000-4999 from JS — passing
    // 1006 throws InvalidAccessError, the WS stays OPEN, and the loop hangs
    // until the bridge's own pong-timeout fires (~10s delay).
    vi.useFakeTimers()
    const { client, socket } = makeClient()
    client.connect()
    // Pin the original socket: scheduleReconnect creates a replacement and
    // `socket()` would then return the new one.
    const original = socket()
    handshake(client, original)
    vi.advanceTimersByTime(5_000)
    const lastSent = original.sent[original.sent.length - 1]
    expect((JSON.parse(lastSent) as { type: string }).type).toBe("ping")
    vi.advanceTimersByTime(5_000)
    expect(original.lastCloseArgs?.code).toBe(WS_CLOSE_CODES.protocol_violation)
    expect(original.lastCloseArgs?.reason).toBe("pong_timeout")
    // NOT 1006 — the spec-forbidden code that used to throw and no-op.
    expect(original.lastCloseArgs?.code).not.toBe(1006)
  })
})
