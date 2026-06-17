/// <reference types="cypress" />

const {
  PROVIDERS,
  getOpenAIConfiguredSettings,
  getOpenAIPermissionedSettings,
  createToolCallFlow,
} = require("../../utils/aiAssistant")

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

const installExecDqlIntercept = () => {
  cy.intercept("GET", "**/exec*", (req) => {
    req.reply({
      statusCode: 200,
      body: {
        query: "SELECT 1",
        columns: [{ name: "c1", type: "LONG" }],
        dataset: [[1]],
        count: 1,
        timestamp: -1,
      },
    })
  }).as("exec")
}

// get_questdb_toc fetches the docs TOC over the network; stub it so the free
// tool resolves deterministically instead of reaching questdb.com.
const installDocsTocIntercept = () => {
  cy.intercept("GET", "**/web-console/toc-list.json", {
    statusCode: 200,
    body: { functions: ["count()"], operators: ["="], sql: ["SELECT"] },
  }).as("docsToc")
}

// Every backend a granted tool can touch, stubbed in one call so a single
// conversation can drive the full surface matrix without hitting the live DB.
const installToolStubs = () => {
  installValidateIntercept()
  installExecDqlIntercept()
  installDocsTocIntercept()
}

describe("ai assistant permissions", () => {
  beforeEach(() => {
    // Fail loudly on any unmocked provider request — each test scripts its own intercept.
    cy.intercept("POST", PROVIDERS.openai.endpoint, (req) => {
      throw new Error(
        `Unhandled OpenAI request detected! Request body: ${JSON.stringify(
          req.body,
        ).slice(0, 200)}...`,
      )
    }).as("unhandledOpenAI")
  })

  describe("PermissionsSection in settings modals", () => {
    beforeEach(() => {
      cy.loadConsoleWithAuth(false, getOpenAIConfiguredSettings())
    })

    it("renders permission level select with cascading levels in SettingsModal", () => {
      cy.getByDataHook("ai-assistant-settings-button")
        .should("be.visible")
        .click()

      cy.getByDataHook("permissions").should("be.visible")
      cy.getByDataHook("permissions-trigger").should("contain", "Schema access")

      // Raise to Write: trigger label updates and all levels listed in menu.
      cy.getByDataHook("permissions-trigger").click()
      cy.getByDataHook("permission-level-write").click()
      cy.getByDataHook("permissions-trigger").should("contain", "Write")

      // Drop to None: trigger label updates back.
      cy.getByDataHook("permissions-trigger").click()
      cy.getByDataHook("permission-level-none").click()
      cy.getByDataHook("permissions-trigger").should("contain", "None")
    })
  })

  describe("tool permission gate — one pass per level", () => {
    const GRANTED = { excludes: ["PERMISSION_DENIED"] }
    const GRANTED_DQL = {
      includes: ['"type":"dql"'],
      excludes: ["PERMISSION_DENIED"],
    }
    const DENIED_SCHEMA = {
      includes: ["PERMISSION_DENIED", "grantSchemaAccess"],
    }
    const DENIED_READ = { includes: ["PERMISSION_DENIED", "'read' permission"] }
    const DENIED_WRITE = {
      includes: ["PERMISSION_DENIED", "'write' permission"],
    }

    const hasRead = (level) => level === "read" || level === "write"

    // Each surface is one tool call; `expect(level)` is the assertion for that
    // surface's tool result at the configured level. free tools never gate;
    // schema tools need grantSchemaAccess; run_query DQL needs read, DDL/DML
    // needs write.
    const SURFACES = [
      {
        toolCall: { name: "validate_query", args: { query: "SELECT 1" } },
        expect: () => GRANTED,
      },
      {
        toolCall: { name: "suggest_query", args: { query: "SELECT 1" } },
        expect: () => GRANTED,
      },
      {
        toolCall: { name: "get_questdb_toc", args: {} },
        expect: () => GRANTED,
      },
      {
        toolCall: { name: "get_tables", args: {} },
        expect: (level) => (level === "none" ? DENIED_SCHEMA : GRANTED),
      },
      {
        toolCall: {
          name: "get_table_schema",
          args: { table_name: "btc_trades" },
        },
        expect: (level) => (level === "none" ? DENIED_SCHEMA : GRANTED),
      },
      {
        toolCall: {
          name: "get_table_details",
          args: { table_name: "btc_trades" },
        },
        expect: (level) => (level === "none" ? DENIED_SCHEMA : GRANTED),
      },
      {
        toolCall: {
          name: "run_query",
          args: { sql: "SELECT count(*) FROM btc_trades" },
        },
        expect: (level) => (hasRead(level) ? GRANTED_DQL : DENIED_READ),
      },
      {
        toolCall: { name: "run_query", args: { sql: "DROP TABLE btc_trades" } },
        expect: (level) => (level === "write" ? GRANTED : DENIED_WRITE),
      },
    ]

    const buildSteps = (level) => {
      const steps = SURFACES.map((surface, index) => ({
        toolCall: surface.toolCall,
        ...(index > 0
          ? { expectToolResult: SURFACES[index - 1].expect(level) }
          : {}),
      }))
      steps.push({
        finalResponse: {
          explanation: "Permission matrix probe complete.",
          sql: null,
        },
        expectToolResult: SURFACES[SURFACES.length - 1].expect(level),
      })
      return steps
    }

    const runMatrix = (level) => {
      const flow = createToolCallFlow({
        provider: "openai",
        streaming: true,
        question: `Probe tool permissions for the ${level} level.`,
        steps: buildSteps(level),
      })

      flow.intercept()
      cy.getByDataHook("ai-chat-button").click()
      cy.getByDataHook("chat-input-textarea")
        .should("be.visible")
        .type(flow.question)
      cy.getByDataHook("chat-send-button").click()
      flow.waitForCompletion()

      cy.getByDataHook("chat-message-assistant")
        .should("be.visible")
        .should("contain", "matrix probe complete")
    }

    const LEVELS = {
      none: { read: false, write: false, grantSchemaAccess: false },
      schema: { read: false, write: false, grantSchemaAccess: true },
      read: { read: true, write: false, grantSchemaAccess: true },
      write: { read: true, write: true, grantSchemaAccess: true },
    }

    const loadAtLevel = (level) => {
      cy.loadConsoleWithAuth(
        false,
        getOpenAIPermissionedSettings(LEVELS[level]),
      )
      installToolStubs()
    }

    it("none: free tools pass, schema and SQL tools are denied", () => {
      loadAtLevel("none")
      runMatrix("none")
    })

    it("schema access: schema tools pass, SQL tools still denied", () => {
      loadAtLevel("schema")
      runMatrix("schema")
    })

    it("read access: DQL runs, write SQL still denied", () => {
      loadAtLevel("read")
      runMatrix("read")
    })

    it("write access: every tool surface is granted", () => {
      loadAtLevel("write")
      runMatrix("write")
    })
  })
})
