// Fake MCP-bridge WebSocket shared by the bridge e2e specs. Installed before
// the app boots; the instance is exposed on `win.__mcpFakeWS`.

const TEST_BRIDGE_URL = "ws://127.0.0.1:57123"
const TEST_BRIDGE_TOKEN = "abcdef0123456789abcdef0123456789"
// Must match src/utils/mcp/protocolVersion.ts; mismatches are silently dropped.
const PROTOCOL_VERSION = "1"

const installFakeWebSocket = (win) => {
  class FakeWS {
    constructor(url) {
      this.url = url
      this.readyState = 0
      this.sent = []
      this.listeners = {}
      win.__mcpFakeWS = this
      // Async "open" mirrors real WebSocket — lets listener registration finish.
      win.setTimeout(() => {
        this.readyState = 1
        this._dispatch("open", {})
      }, 0)
    }
    addEventListener(type, fn) {
      if (!this.listeners[type]) this.listeners[type] = new Set()
      this.listeners[type].add(fn)
    }
    removeEventListener(type, fn) {
      this.listeners[type]?.delete(fn)
    }
    send(data) {
      if (this.readyState !== 1) {
        throw new Error("FakeWS.send while not open")
      }
      this.sent.push(data)
      const parsed = JSON.parse(data)
      if (parsed.type === "ping") {
        this.receive({
          v: PROTOCOL_VERSION,
          type: "pong",
          nonce: parsed.nonce,
        })
      }
    }
    close() {
      this.readyState = 3
      this._dispatch("close", { code: 1000, reason: "test-close" })
    }
    receive(payload) {
      this._dispatch("message", { data: JSON.stringify(payload) })
    }
    helloAck() {
      this.receive({
        v: PROTOCOL_VERSION,
        type: "hello_ack",
        sessionId: "test-session",
        heartbeatIntervalMs: 60000,
        seenToolCount: 1,
      })
    }
    toolCall(name, args, requestId) {
      const id = requestId || "req-" + Math.random().toString(36).slice(2)
      this.receive({
        v: PROTOCOL_VERSION,
        type: "tool_call",
        requestId: id,
        name,
        arguments: args,
        deadlineMs: 15000,
      })
      return id
    }
    _dispatch(type, ev) {
      this.listeners[type]?.forEach((fn) => fn(ev))
    }
    framesOfType(type) {
      return this.sent.map((s) => JSON.parse(s)).filter((m) => m.type === type)
    }
  }
  // Real-WebSocket statics — MCPBridgeClient reads WebSocket.OPEN.
  FakeWS.CONNECTING = 0
  FakeWS.OPEN = 1
  FakeWS.CLOSING = 2
  FakeWS.CLOSED = 3
  win.WebSocket = FakeWS
}

module.exports = {
  installFakeWebSocket,
  PROTOCOL_VERSION,
  TEST_BRIDGE_TOKEN,
  TEST_BRIDGE_URL,
}
