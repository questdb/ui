/// <reference types="cypress" />

// E2E coverage for the MCP bridge permission system.

const contextPath = process.env.QDB_HTTP_CONTEXT_WEB_CONSOLE || ""
const baseUrl = `http://localhost:9999${contextPath}`

const TEST_BRIDGE_URL = "ws://127.0.0.1:57123"
const TEST_BRIDGE_TOKEN = "abcdef0123456789abcdef0123456789"
// Must match src/utils/mcp/protocolVersion.ts; mismatches are silently dropped.
const PROTOCOL_VERSION = "1"

// Fake WebSocket installed before the app boots; exposed on `win.__mcpFakeWS`.
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

// Permission classifier calls /api/v1/sql/validate to distinguish DQL vs DDL/DML.
const installValidateIntercept = () => {
  cy.intercept("GET", "**/api/v1/sql/validate*", (req) => {
    const url = new URL(req.url)
    const sql = (url.searchParams.get("query") || "").trim().toUpperCase()
    if (sql.startsWith("SELECT") || sql.startsWith("SHOW")) {
      req.reply({
        statusCode: 200,
        body: {
          query: sql,
          columns: [{ name: "c1", type: "LONG" }],
          timestamp: -1,
        },
      })
      return
    }
    if (
      sql.startsWith("INSERT") ||
      sql.startsWith("UPDATE") ||
      sql.startsWith("DELETE")
    ) {
      req.reply({ statusCode: 200, body: { queryType: "INSERT" } })
      return
    }
    req.reply({ statusCode: 200, body: { queryType: "CREATE TABLE" } })
  }).as("validate")
}

const deepLinkSuffix = () =>
  `?mcp-pair=1&mcp-ws=${encodeURIComponent(TEST_BRIDGE_URL)}` +
  `&mcp-token=${encodeURIComponent(TEST_BRIDGE_TOKEN)}`

// Visit with deep-link params before login so they survive into the SPA boot.
const loginAndVisitDeepLink = (seedLocalStorage = {}) => {
  cy.visit(`${baseUrl}/${deepLinkSuffix()}`, {
    onBeforeLoad: (win) => {
      win.localStorage.clear()
      win.sessionStorage.clear()
      win.indexedDB.deleteDatabase("web-console")
      for (const [k, v] of Object.entries(seedLocalStorage)) {
        win.localStorage.setItem(k, v)
      }
      installFakeWebSocket(win)
    },
  })
  cy.loginWithUserAndPassword()
}

const waitForPaired = () => {
  cy.window({ timeout: 10000 }).its("__mcpFakeWS").should("exist")
  cy.window({ timeout: 10000 }).should((win) => {
    expect(win.__mcpFakeWS.framesOfType("hello").length).to.be.greaterThan(0)
  })
  cy.window().then((win) => win.__mcpFakeWS.helloAck())
  cy.getByDataHook("mcp-bridge-status-pill", { timeout: 10000 }).should(
    "contain",
    "MCP connected",
  )
}

const lastToolResult = (win, requestId) => {
  const results = win.__mcpFakeWS.framesOfType("tool_result")
  return results.find((r) => r.requestId === requestId)
}

describe("MCP bridge permissions (e2e)", () => {
  beforeEach(() => {
    installValidateIntercept()
  })

  describe("consent modal", () => {
    it("user lowers to Read before Connect; hello carries { grantSchemaAccess:T, read:T, write:F }", () => {
      loginAndVisitDeepLink()

      cy.getByDataHook("permissions").should("be.visible")
      cy.getByDataHook("permissions-trigger").should("contain", "Write")

      cy.getByDataHook("permissions-trigger").click()
      cy.getByDataHook("permission-level-read").click()
      cy.getByDataHook("permissions-trigger").should("contain", "Read")

      cy.getByDataHook("mcp-pair-consent-connect").click()

      cy.window().should((win) => {
        const hellos = win.__mcpFakeWS.framesOfType("hello")
        expect(hellos.length).to.be.greaterThan(0)
        expect(hellos[0].permissions).to.deep.equal({
          grantSchemaAccess: true,
          read: true,
          write: false,
        })
        expect(hellos[0].token).to.equal(TEST_BRIDGE_TOKEN)
      })

      cy.window().then((win) => win.__mcpFakeWS.helloAck())
      cy.getByDataHook("mcp-bridge-status-pill").should(
        "contain",
        "MCP connected",
      )
      cy.window().then((win) => {
        expect(
          JSON.parse(win.localStorage.getItem("mcp:permissions")),
        ).to.deep.equal({
          grantSchemaAccess: true,
          read: true,
          write: false,
        })
      })
    })

    it("user drops to None; hello carries all-false", () => {
      loginAndVisitDeepLink()

      cy.getByDataHook("permissions-trigger").click()
      cy.getByDataHook("permission-level-none").click()
      cy.getByDataHook("permissions-trigger").should("contain", "None")

      cy.getByDataHook("mcp-pair-consent-connect").click()
      cy.window().should((win) => {
        const hellos = win.__mcpFakeWS.framesOfType("hello")
        expect(hellos.length).to.be.greaterThan(0)
        expect(hellos[0].permissions).to.deep.equal({
          grantSchemaAccess: false,
          read: false,
          write: false,
        })
      })
    })
  })

  describe("permission gate over the wire", () => {
    const expectedLabel = (p) => {
      if (p.write) return "Write"
      if (p.read) return "Read"
      if (p.grantSchemaAccess) return "Schema access"
      return "None"
    }
    const setupPaired = (permissions) => {
      loginAndVisitDeepLink({
        "mcp:permissions": JSON.stringify(permissions),
      })
      cy.getByDataHook("permissions-trigger").should(
        "contain",
        expectedLabel(permissions),
      )
      cy.getByDataHook("mcp-pair-consent-connect").click()
      waitForPaired()
    }

    it("read+write granted: DQL, DML, schema all run", () => {
      setupPaired({ grantSchemaAccess: true, read: true, write: true })

      const ids = {}
      cy.window().then((win) => {
        ids.dql = win.__mcpFakeWS.toolCall("run_query", {
          sql: "SELECT 1",
          limit: 10,
        })
        ids.dml = win.__mcpFakeWS.toolCall("run_query", {
          sql: "INSERT INTO t VALUES (1)",
          limit: 10,
        })
        ids.schema = win.__mcpFakeWS.toolCall("get_tables", {})
      })

      cy.window({ timeout: 10000 }).should((w) => {
        expect(w.__mcpFakeWS.framesOfType("tool_result").length).to.be.gte(3)
      })

      cy.window().then((w) => {
        // Only PERMISSION_DENIED matters here; other errors are ignored.
        for (const id of Object.values(ids)) {
          const r = lastToolResult(w, id)
          expect(r, `result for ${id}`).to.exist
          if (r.isError) {
            expect(r.content[0].text).to.not.match(/PERMISSION_DENIED/)
          }
        }
      })
    })

    it("read-only: DQL granted, DDL/DML denied via /validate classification", () => {
      setupPaired({ grantSchemaAccess: true, read: true, write: false })

      const ids = {}
      cy.window().then((win) => {
        ids.dql = win.__mcpFakeWS.toolCall("run_query", {
          sql: "SELECT * FROM t",
          limit: 10,
        })
        ids.dml = win.__mcpFakeWS.toolCall("run_query", {
          sql: "INSERT INTO t VALUES (1)",
          limit: 10,
        })
        ids.ddl = win.__mcpFakeWS.toolCall("run_query", {
          sql: "CREATE TABLE t (a INT)",
          limit: 10,
        })
        ids.schema = win.__mcpFakeWS.toolCall("get_tables", {})
      })

      cy.window({ timeout: 10000 }).should((w) => {
        expect(w.__mcpFakeWS.framesOfType("tool_result").length).to.be.gte(4)
      })

      cy.window().then((w) => {
        const dml = lastToolResult(w, ids.dml)
        expect(dml.isError).to.equal(true)
        expect(dml.content[0].text).to.match(/PERMISSION_DENIED/)
        expect(dml.content[0].text).to.match(/'write' permission/)

        const ddl = lastToolResult(w, ids.ddl)
        expect(ddl.isError).to.equal(true)
        expect(ddl.content[0].text).to.match(/PERMISSION_DENIED/)

        const schema = lastToolResult(w, ids.schema)
        if (schema.isError) {
          expect(schema.content[0].text).to.not.match(/PERMISSION_DENIED/)
        }
        const dql = lastToolResult(w, ids.dql)
        if (dql.isError) {
          expect(dql.content[0].text).to.not.match(/PERMISSION_DENIED/)
        }
      })
    })

    it("no permissions: even DQL + schema reads are denied", () => {
      setupPaired({ grantSchemaAccess: false, read: false, write: false })

      const ids = {}
      cy.window().then((win) => {
        ids.dql = win.__mcpFakeWS.toolCall("run_query", {
          sql: "SELECT 1",
          limit: 10,
        })
        ids.schema = win.__mcpFakeWS.toolCall("get_tables", {})
      })

      cy.window({ timeout: 10000 }).should((w) => {
        expect(w.__mcpFakeWS.framesOfType("tool_result").length).to.be.gte(2)
      })

      cy.window().then((w) => {
        const dql = lastToolResult(w, ids.dql)
        expect(dql.isError).to.equal(true)
        expect(dql.content[0].text).to.match(/PERMISSION_DENIED/)

        const schema = lastToolResult(w, ids.schema)
        expect(schema.isError).to.equal(true)
        expect(schema.content[0].text).to.match(/PERMISSION_DENIED/)
        expect(schema.content[0].text).to.match(/'grantSchemaAccess'/)
      })
    })
  })

  describe("popover: submit-only persistence", () => {
    it("lowering to Read without clicking Apply does NOT change localStorage", () => {
      loginAndVisitDeepLink()
      cy.getByDataHook("mcp-pair-consent-connect").click()
      waitForPaired()

      cy.getByDataHook("mcp-bridge-status-pill").click()
      cy.getByDataHook("mcp-pair-popover").should("be.visible")

      cy.window().then((win) => {
        expect(
          JSON.parse(win.localStorage.getItem("mcp:permissions")),
        ).to.deep.equal({ grantSchemaAccess: true, read: true, write: true })
      })

      cy.getByDataHook("permissions-trigger").click()
      cy.getByDataHook("permission-level-read").click()
      cy.getByDataHook("mcp-pair-cancel").click()

      cy.window().then((win) => {
        expect(
          JSON.parse(win.localStorage.getItem("mcp:permissions")),
        ).to.deep.equal({ grantSchemaAccess: true, read: true, write: true })
      })

      cy.getByDataHook("mcp-bridge-status-pill").click()
      cy.getByDataHook("permissions-trigger").should("contain", "Write")
    })

    it("lower to Read + Apply: localStorage updates, no reconnect", () => {
      loginAndVisitDeepLink()
      cy.getByDataHook("mcp-pair-consent-connect").click()
      waitForPaired()

      cy.getByDataHook("mcp-bridge-status-pill").click()
      cy.getByDataHook("permissions-trigger").click()
      cy.getByDataHook("permission-level-read").click()
      cy.getByDataHook("mcp-pair-submit").should("contain", "Connect").click()

      cy.window().then((win) => {
        expect(
          JSON.parse(win.localStorage.getItem("mcp:permissions")),
        ).to.deep.equal({ grantSchemaAccess: true, read: true, write: false })
        expect(win.__mcpFakeWS.framesOfType("hello")).to.have.length(1)
      })
      cy.getByDataHook("mcp-bridge-status-pill").should(
        "contain",
        "MCP connected",
      )
    })
  })

  describe("persistence across refresh", () => {
    it("consented pair auto-restores; new hello carries the previously-committed permissions", () => {
      loginAndVisitDeepLink()
      cy.getByDataHook("permissions-trigger").click()
      cy.getByDataHook("permission-level-read").click()
      cy.getByDataHook("mcp-pair-consent-connect").click()
      waitForPaired()

      // cy.reload doesn't accept onBeforeLoad — re-visit so the fake WS reinstalls.
      cy.visit(baseUrl, {
        onBeforeLoad: (win) => installFakeWebSocket(win),
      })

      cy.window({ timeout: 10000 }).its("__mcpFakeWS").should("exist")
      cy.window({ timeout: 10000 }).should((win) => {
        expect(win.__mcpFakeWS.framesOfType("hello").length).to.be.greaterThan(
          0,
        )
      })
      cy.window().then((win) => {
        const hello = win.__mcpFakeWS.framesOfType("hello")[0]
        expect(hello.permissions).to.deep.equal({
          grantSchemaAccess: true,
          read: true,
          write: false,
        })
        win.__mcpFakeWS.helloAck()
      })
      cy.getByDataHook("mcp-bridge-status-pill").should(
        "contain",
        "MCP connected",
      )
    })
  })
})
