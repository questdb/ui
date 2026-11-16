/// <reference types="cypress" />

const { createNotebookBuffer } = require("./utils/editorBuffers")
const {
  getOpenAIConfiguredSettings,
  interceptAIChatRequest,
} = require("./utils/aiAssistant")
const {
  installFakeWebSocket,
  TEST_BRIDGE_TOKEN,
  TEST_BRIDGE_URL,
} = require("./utils/mcpFakeWebSocket")

const baseUrl = Cypress.config("baseUrl").replace(/\/$/, "")
const { origin, pathname: prefix } = new URL(baseUrl)
const pagePath = `${prefix}/index.html`
const headers = { Authorization: `Basic ${btoa("admin:quest")}` }
const table = "context_path_import.csv"

const writePreferences = (preferences) =>
  cy.request({ url: `${baseUrl}/settings`, headers }).then(({ body }) =>
    cy.request({
      method: "PUT",
      url: `${baseUrl}/settings`,
      headers,
      qs: { version: body["preferences.version"] },
      body: preferences,
    }),
  )

const assertCookieAccess = (status) =>
  cy.window().then(async (win) => {
    const response = await win.fetch(`${baseUrl}/exec?query=select%207`, {
      credentials: "same-origin",
    })
    expect(response.status).to.equal(status)
  })

describe("Console served by QuestDB under a context path", () => {
  let originalPreferences

  before(() => {
    expect(prefix, "a non-root context path is required").not.to.equal("/")
    cy.request({ url: `${baseUrl}/settings`, headers }).then(({ body }) => {
      originalPreferences = body.preferences
    })
    cy.execAdminQuery(`DROP TABLE IF EXISTS "${table}"`)
  })

  beforeEach(() => {
    cy.intercept({ url: `${origin}/**`, middleware: true }, (req) => {
      const path = new URL(req.url).pathname
      if (path.startsWith("/__cypress/")) return
      expect(path, "application request keeps the context path").to.satisfy(
        (value) => value === prefix || value.startsWith(`${prefix}/`),
      )
      if (/\.(js|css|wasm)$/.test(path)) {
        req.on("response", (response) => {
          expect(response.statusCode, path).to.be.oneOf([200, 304])
          if (response.statusCode === 200) {
            expect(response.headers["content-type"], path).not.to.include(
              "text/html",
            )
          }
        })
      }
    })
  })

  after(() => {
    cy.execAdminQuery(`DROP TABLE IF EXISTS "${table}"`)
    if (originalPreferences) writePreferences(originalPreferences)
  })

  it("loads the built console, saves server settings, and restores them on reload", () => {
    // Given
    for (const suffix of ["", "/"]) {
      cy.request({ url: `${baseUrl}${suffix}`, followRedirect: false }).then(
        ({ status, headers }) => {
          expect(status).to.equal(301)
          expect(headers.location).to.equal(pagePath)
        },
      )
    }
    cy.intercept("GET", `${baseUrl}/assets/console-configuration.json`).as(
      "configuration",
    )
    cy.intercept("GET", `${baseUrl}/warnings`).as("warnings")
    cy.intercept("GET", `${baseUrl}/assets/vs/base/worker/workerMain.js*`).as(
      "monacoWorker",
    )
    cy.intercept("PUT", `${baseUrl}/settings?*`).as("savePreferences")
    cy.loadConsoleWithAuth()
    cy.wait("@configuration").its("response.statusCode").should("equal", 200)
    cy.wait("@warnings").its("response.statusCode").should("equal", 200)
    cy.wait("@monacoWorker")
      .its("response.statusCode")
      .should("be.oneOf", [200, 304])
    cy.location("pathname").should("equal", pagePath)

    // When
    cy.getByDataHook("topbar-instance-badge").realHover()
    cy.getByDataHook("topbar-instance-edit-icon").click()
    cy.getByDataHook("topbar-instance-name-input")
      .clear()
      .type("Context path check")
    cy.getByDataHook("topbar-instance-save-button").click()
    cy.wait("@savePreferences").its("response.statusCode").should("equal", 200)
    cy.reload()

    // Then
    cy.getEditor().should("be.visible")
    cy.getByDataHook("topbar-instance-name").should(
      "contain",
      "Context path check",
    )
    cy.location("pathname").should("equal", pagePath)
    writePreferences(originalPreferences)
  })

  it("signs in, validates and runs SQL, then ends the cookie session on logout", () => {
    // Given
    cy.handleStorageAndVisit(baseUrl)
    cy.loginWithUserAndPassword()
    cy.intercept("GET", `${baseUrl}/api/v1/sql/validate*`).as("validation")

    // When
    cy.typeQueryDirectly("select 42 as answer")

    // Then
    cy.wait("@validation").its("response.statusCode").should("equal", 200)
    cy.clickRunIconInLine(1)
    cy.getGridRow(0).should("contain", "42")
    assertCookieAccess(200)
    cy.reload()
    cy.getEditor().should("be.visible")
    assertCookieAccess(200)

    // When
    cy.intercept("GET", `${baseUrl}/exec?query=*&session=false`).as("logout")
    cy.getByDataHook("button-logout").click()
    cy.wait("@logout")
    cy.reload()

    // Then
    cy.getByDataHook("auth-login").should("be.visible")
    assertCookieAccess(401)
    cy.location("pathname").should("equal", pagePath)
  })

  it("imports CSV, finds its table, and downloads its query results", () => {
    // Given
    cy.loadConsoleWithAuth()
    cy.intercept("GET", `${baseUrl}/chk?*`).as("tableCheck")
    cy.intercept("POST", `${baseUrl}/imp?*`).as("import")
    cy.intercept("GET", `${baseUrl}/exp?*`).as("export")

    // When
    cy.getByDataHook("import-panel-button").click()
    cy.get('input[type="file"]').selectFile(
      {
        contents: Cypress.Buffer.from(
          "id,value\n1,context-prefix\n2,second-row\n",
        ),
        fileName: table,
      },
      { force: true },
    )
    cy.getByDataHook("import-table-column-schema").should("be.visible")
    cy.getByDataHook("import-upload-button").click()

    // Then
    cy.wait("@tableCheck").its("response.statusCode").should("equal", 200)
    cy.wait("@import").its("response.statusCode").should("equal", 200)
    cy.getByDataHook("import-file-status").should("contain", "Imported 2 rows")
    cy.getByDataHook("schema-table-title").should("contain", table)
    cy.contains("button", "Result").click()
    cy.getGridRow(0).should("contain", "context-prefix")

    // When
    cy.getByDataHook("download-dropdown-button").click()
    cy.getByDataHook("download-csv-button").click()

    // Then
    cy.wait("@export").then(({ request, response }) => {
      expect(response.statusCode).to.equal(200)
      const filename = new URL(request.url).searchParams.get("filename")
      cy.readFile(`${Cypress.config("downloadsFolder")}/${filename}.csv`)
        .should("contain", "context-prefix")
        .and("contain", "second-row")
    })
  })

  it("opens a shared query through the redirect and keeps the prefix when copying it", () => {
    // Given
    const query = "select 'shared under prefix' as value;"
    const params = new URLSearchParams({
      query,
      executeQuery: "true",
      useNewGrid: "1",
      useQuickVis: "1",
    })

    // When
    cy.loadConsoleWithAuth(false, {}, { url: `${baseUrl}?${params}#shared` })

    // Then
    cy.getGridRow(0).should("contain", "shared under prefix")
    cy.location("pathname").should("equal", pagePath)
    cy.location("search")
      .should("not.contain", "useNewGrid")
      .and("not.contain", "useQuickVis")
    cy.location("hash").should("equal", "#shared")

    // When
    cy.openRunDropdownInLine(1)
    cy.getByDataHook("dropdown-item-copy-query-link").click()

    // Then
    cy.window().then(async (win) => {
      const link = new URL(await win.navigator.clipboard.readText())
      expect(link.origin).to.equal(origin)
      expect(link.pathname).to.equal(pagePath)
      expect(link.searchParams.get("query")).to.equal(query)
      expect(link.searchParams.get("executeQuery")).to.equal("true")
    })
  })

  it("pairs an external MCP bridge and executes its SQL against the prefixed server", () => {
    // Given
    const params = new URLSearchParams({
      "mcp-pair": "1",
      "mcp-ws": TEST_BRIDGE_URL,
      "mcp-token": TEST_BRIDGE_TOKEN,
      keep: "me",
    })
    cy.loadConsoleWithAuth(
      false,
      {},
      {
        url: `${baseUrl}/?${params}#bridge`,
        onBeforeLoad: installFakeWebSocket,
      },
    )

    // When
    cy.getByDataHook("mcp-pair-consent-connect").click()
    cy.window().should((win) => {
      expect(win.__mcpFakeWS.framesOfType("hello")).to.have.length(1)
    })
    cy.window().then((win) => win.__mcpFakeWS.helloAck())
    cy.getByDataHook("mcp-status-pill").should("contain", "MCP connected")
    cy.window().then((win) =>
      win.__mcpFakeWS.toolCall(
        "run_query",
        { sql: "select 7351 as answer", limit: 10 },
        "context-query",
      ),
    )

    // Then
    cy.window().should((win) => {
      const result = win.__mcpFakeWS
        .framesOfType("tool_result")
        .find((frame) => frame.requestId === "context-query")
      expect(result).to.exist
      expect(result.isError).to.equal(false)
      expect(result.content.map((part) => part.text).join("\n")).to.contain(
        "7351",
      )
    })
    cy.location("pathname").should("equal", pagePath)
    cy.location("search").should("equal", "?keep=me")
    cy.location("hash").should("equal", "#bridge")
  })

  it("loads the AI assistant and receives a reply from an external provider", () => {
    // Given
    cy.loadConsoleWithAuth(false, getOpenAIConfiguredSettings())
    interceptAIChatRequest("openai")

    // When
    cy.getByDataHook("ai-chat-button").click()
    cy.getByDataHook("chat-input-textarea").type("Hello AI")
    cy.getByDataHook("chat-send-button").click()

    // Then
    cy.waitForAIResponse("@openaiChatRequest")
    cy.getByDataHook("chat-message-assistant").should(
      "contain",
      "Test response explanation",
    )
    cy.location("pathname").should("equal", pagePath)
  })

  it("loads the regex engine and highlights notebook results", () => {
    // Given
    cy.loadConsoleWithAuth(
      false,
      {},
      { buffers: [createNotebookBuffer("select 'EURUSD' as symbol")] },
    )
    cy.focusNotebookCell()
    cy.get("[data-notebook-cell] button[aria-label='Run cell']").click()
    cy.getByDataHook("grid-cell").should("contain", "EURUSD")

    // When
    cy.get("[data-notebook-cell] button[aria-label='More actions']").click()
    cy.contains("[role='menuitem']", "Highlight rules").click()
    cy.contains("button", "+ Add rule").click()
    cy.getByDataHook("highlight-rule")
      .find("button[aria-label='Column']")
      .click()
    cy.contains("[role='option']", /^symbol$/).click()
    cy.getByDataHook("highlight-rule")
      .find("button[aria-label^='Condition']")
      .click()
    cy.contains("[role^='menuitem']", "matches regex").click()
    cy.getByDataHook("highlight-rule")
      .find("[aria-label='Regular expression']")
      .type("^EUR")
    cy.contains("button", "Save").click()

    // Then
    cy.getByDataHook("highlight-settings-drawer").should("not.exist")
    cy.get("[data-hook=grid-cell][data-highlight]").should("contain", "EURUSD")
  })
})
