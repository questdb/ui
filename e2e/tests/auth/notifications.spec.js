/// <reference types="cypress" />

const { seedNotebookOnboarding } = require("../../utils")

const contextPath = process.env.QDB_HTTP_CONTEXT_WEB_CONSOLE || ""
const baseUrl = `http://localhost:9999${contextPath}`
const tokenUrl = "https://oauth.example.com/token"

// Keep the real Schema, React event delegation, Toastify, and CSS. Only the
// HTTP server/IdP and OS clipboard permission are stubbed, so these regressions
// need no licensed database or interactive clipboard access.
const visitConsole = (refreshWarning = false, theme = "dark") => {
  if (refreshWarning) cy.clock(Date.now(), ["Date"])
  cy.intercept("GET", `${baseUrl}/settings`, {
    config: {
      "release.type": refreshWarning ? "EE" : "OSS",
      "release.version": "9.0.0",
      "acl.enabled": refreshWarning,
      "acl.oidc.enabled": refreshWarning,
      "acl.oidc.client.id": "notification-tests",
      "acl.oidc.authorization.endpoint": "https://oauth.example.com/auth",
      "acl.oidc.token.endpoint": tokenUrl,
      "acl.oidc.state.required": false,
      "acl.oidc.groups.encoded.in.token": false,
    },
    preferences: { instance_name: "before", instance_type: "development" },
    "preferences.version": 1,
  }).as("settings")
  cy.intercept("POST", tokenUrl, (req) => {
    if (new URLSearchParams(req.body).get("grant_type") === "refresh_token") {
      req.reply({ statusCode: 503, body: { error: "temporarily_unavailable" } })
    } else {
      req.reply({
        access_token: "notification-access",
        refresh_token: "notification-refresh",
        token_type: "Bearer",
        expires_in: 20,
      })
    }
  })
  cy.intercept("GET", `${baseUrl}/exec*`, (req) => {
    const query = new URL(req.url).searchParams.get("query") ?? ""
    let body = { columns: [], dataset: [], count: 0 }
    if (query.toLowerCase() === "tables();") {
      body = {
        columns: [
          { name: "table_name", type: "STRING" },
          { name: "partitionBy", type: "STRING" },
          { name: "walEnabled", type: "BOOLEAN" },
        ],
        dataset: [["focus_probe", "NONE", false]],
        count: 1,
      }
    } else if (query.toLowerCase().includes("select value from focus_probe")) {
      body = {
        columns: [{ name: "value", type: "INT" }],
        dataset: [[1], [2], [3]],
        count: 3,
      }
    } else if (query.toLowerCase().includes("select current_user")) {
      body = {
        columns: [{ name: "current_user", type: "STRING" }],
        dataset: [["admin"]],
        count: 1,
      }
    } else if (query.includes("information_schema.")) {
      body = {
        columns: [
          { name: "table_name", type: "STRING" },
          { name: "ordinal_position", type: "INT" },
          { name: "column_name", type: "STRING" },
          { name: "data_type", type: "STRING" },
        ],
        dataset: [["focus_probe", 1, "value", "INT"]],
        count: 1,
      }
    }
    req.reply({
      body: {
        ...body,
        query,
        timings: { compiler: 0, execute: 0, count: 0, authentication: 0 },
      },
    })
  })
  cy.intercept("GET", `${baseUrl}/warnings*`, [])
  cy.visit(`${baseUrl}${refreshWarning ? "?code=notifications" : ""}`, {
    onBeforeLoad(win) {
      win.localStorage.clear()
      cy.stub(win.navigator.clipboard, "writeText").resolves()
      seedNotebookOnboarding(win)
      win.localStorage.setItem("auto.refresh.tables", "false")
      win.localStorage.setItem("feature.new.grid", "true")
      win.localStorage.setItem("appearance.themePreference", theme)
    },
  })
  cy.wait("@settings")
  cy.getEditor().should("be.visible")
  cy.expandTables()
  cy.getByDataHook("schema-table-title").should("contain", "focus_probe")
}

const pressKey = ($element, options) => {
  const element = $element[0]
  const event = new element.ownerDocument.defaultView.KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    ...options,
  })
  element.dispatchEvent(event)
  return event
}
const focusNotification = ($element) =>
  pressKey($element, { key: "n", code: "KeyN", altKey: true })
const tableRow = () =>
  cy
    .getByDataHook("schema-table-title")
    .contains("focus_probe")
    .closest("[tabindex]")

const showCopyToast = () => {
  tableRow()
    .click()
    .should("be.focused")
    .then(($row) => {
      pressKey($row, { key: "c", code: "KeyC", ctrlKey: true })
    })
  cy.contains(".Toastify__toast--success", "Copied to clipboard").should(
    "be.visible",
  )
}

describe("notification keyboard integration", () => {
  for (const [theme, color] of [
    ["dark", "rgb(248, 248, 242)"],
    ["light", "rgb(28, 32, 41)"],
  ]) {
    it(`keeps the renewal message readable in ${theme} mode`, () => {
      visitConsole(true, theme)
      cy.get("#sso-refresh-failed .Toastify__toast-body span")
        .first()
        .should("have.css", "color", color)
    })
  }

  it("returns focus with Escape without dismissing the message", () => {
    visitConsole(true)
    tableRow().click().then(focusNotification)
    cy.get("#sso-refresh-failed .Toastify__toast-body")
      .should("be.focused")
      .then(($message) => pressKey($message, { key: "Escape" }))
    tableRow().should("be.focused")
    cy.get("#sso-refresh-failed").should("be.visible")
  })

  it("keeps native PageDown scrolling in a nested non-focusable panel", () => {
    visitConsole()
    // Model the notebook's plain scroll container under the real console main.
    // No notebook/editor worker or persisted tab is needed to exercise the
    // browser's focus/scroll contract. The click and key below are real events.
    cy.document().then((doc) => {
      const panel = doc.createElement("div")
      panel.id = "keyboard-scroll-probe"
      panel.style.cssText =
        "position:fixed;top:150px;left:450px;width:400px;height:200px;overflow:auto;z-index:10"
      const content = doc.createElement("div")
      content.style.height = "3000px"
      panel.appendChild(content)
      doc.querySelector("main").appendChild(panel)
    })
    cy.get("#keyboard-scroll-probe").realClick({ x: 20, y: 20 })
    cy.window().its("document.activeElement.tagName").should("not.eq", "MAIN")
    cy.realPress("PageDown")
    cy.get("#keyboard-scroll-probe").should(($panel) => {
      expect($panel[0].scrollTop).to.be.greaterThan(0)
    })
  })
  for (const kind of ["table", "folder", "column"]) {
    it(`focuses the renewal warning from a schema ${kind} row`, () => {
      visitConsole(true)
      cy.get("#sso-refresh-failed").should("be.visible")
      if (kind === "folder") {
        cy.getByDataHook("collapse-tables")
          .click()
          .should("be.focused")
          .then(focusNotification)
      } else if (kind === "column") {
        tableRow().dblclick()
        cy.getByDataHook("schema-folder-title").contains("Columns").dblclick()
        cy.getByDataHook("schema-column-title")
          .contains("value")
          .closest("[tabindex]")
          .click()
          .should("be.focused")
          .then(focusNotification)
      } else {
        tableRow().click().should("be.focused").then(focusNotification)
      }
      cy.get("#sso-refresh-failed .Toastify__toast-body").should("be.focused")
    })
  }

  it("still consumes schema navigation keys without consuming unrelated shortcuts", () => {
    visitConsole()
    tableRow()
      .click()
      .then(($row) => {
        expect(
          pressKey($row, { key: "x", code: "KeyX", altKey: true })
            .defaultPrevented,
        ).to.equal(false)
        expect(
          pressKey($row, { key: "ArrowRight", code: "ArrowRight" })
            .defaultPrevented,
        ).to.equal(true)
      })
    tableRow().should("have.attr", "data-expanded", "true")
    tableRow().then(($row) => {
      expect(
        pressKey($row, { key: "ArrowDown", code: "ArrowDown" })
          .defaultPrevented,
      ).to.equal(true)
    })
    cy.focused().should("contain.text", "Columns")
    for (const modifiers of [{ altKey: true }, { metaKey: true }]) {
      tableRow()
        .focus()
        .then(($row) => {
          for (const key of ["ArrowLeft", "ArrowRight"]) {
            expect(
              pressKey($row, { key, ...modifiers }).defaultPrevented,
            ).to.equal(true)
          }
        })
    }
    for (const modifiers of [{ ctrlKey: true }, { metaKey: true }]) {
      tableRow().then(($row) => {
        expect(
          pressKey($row, { key: "a", ...modifiers }).defaultPrevented,
        ).to.equal(true)
      })
    }
    tableRow().should("have.attr", "data-expanded", "true")
    cy.getByDataHook("schema-folder-title").contains("Columns").dblclick()
    cy.getByDataHook("schema-column-title")
      .contains("value")
      .closest("[tabindex]")
      .focus()
      .then(($row) => {
        expect(pressKey($row, { key: " " }).defaultPrevented).to.equal(true)
      })
  })

  it("pauses a real timed toast while shortcut-focused, then resumes without stealing focus", () => {
    visitConsole()
    showCopyToast()
    cy.getByDataHook("help-panel-button").focus().then(focusNotification)
    cy.get(".Toastify__toast--success .Toastify__toast-body").should(
      "be.focused",
    )
    cy.get(
      ".Toastify__toast--success .Toastify__progress-bar--animated",
    ).should("have.css", "animation-play-state", "paused")
    // Timer progress is deterministic; CSS pause is asserted above.
    cy.clock()
    cy.tick(2300)
    cy.get(".Toastify__toast--success .Toastify__toast-body").should(
      "be.focused",
    )
    cy.getByDataHook("help-panel-button").focus()
    cy.get(
      ".Toastify__toast--success .Toastify__progress-bar--animated",
    ).should("have.css", "animation-play-state", "running")
    cy.get(
      ".Toastify__toast--success .Toastify__progress-bar--animated",
    ).trigger("animationend")
    cy.clock().invoke("restore")
    cy.get(".Toastify__toast--success").should("not.exist")
    cy.getByDataHook("help-panel-button").should("be.focused")
  })

  it("restores the shortcut origin when a notification message is clicked", () => {
    visitConsole()
    showCopyToast()
    cy.getByDataHook("help-panel-button").focus().then(focusNotification)
    cy.get(".Toastify__toast--success .Toastify__toast-body")
      .should("be.focused")
      .realClick()
    cy.get(".Toastify__toast--success").should("not.exist")
    cy.getByDataHook("help-panel-button").should("be.focused")
  })

  it("keeps the renewal message and its focus when click dismissal is disabled", () => {
    visitConsole(true)
    tableRow().click().then(focusNotification)
    cy.get("#sso-refresh-failed .Toastify__toast-body")
      .should("be.focused")
      .find("span")
      .first()
      .realClick()
    cy.get("#sso-refresh-failed").should("be.visible")
    cy.get("#sso-refresh-failed .Toastify__toast-body").should("be.focused")
  })

  it("confirms a pending settings write and keeps warning focus when sign-in is cancelled", () => {
    let finishWrite
    cy.intercept(
      "PUT",
      `${baseUrl}/settings*`,
      (req) =>
        new Promise((resolve) => {
          finishWrite = () => {
            req.reply({ statusCode: 200, body: {} })
            resolve()
          }
        }),
    ).as("saveSettings")
    visitConsole(true)
    cy.window().then((win) =>
      cy.stub(win, "confirm").returns(false).as("interruptionConfirm"),
    )
    cy.getByDataHook("topbar-instance-edit-icon").click()
    cy.getByDataHook("topbar-instance-name-input").clear().type("changed")
    cy.getByDataHook("topbar-instance-save-button").click()
    cy.wrap(null).should(() => expect(finishWrite).to.be.a("function"))
    cy.getByDataHook("topbar-instance-cancel-button").click()
    tableRow().click().then(focusNotification)
    cy.contains("#sso-refresh-failed button", "Sign in again")
      .realClick()
      .should("be.focused")
    cy.get("@interruptionConfirm").should("have.been.calledOnce")
    cy.getByDataHook("auth-login").should("not.exist")
    cy.get("#sso-refresh-failed").should("be.visible")
    cy.get("@interruptionConfirm").invoke("returns", true)
    cy.contains("#sso-refresh-failed button", "Sign in again").realClick()
    cy.get("@interruptionConfirm").should("have.been.calledTwice")
    cy.getByDataHook("auth-login").should("be.visible")
    cy.getByDataHook("sign-in-error").should("contain", "Verify their outcomes")
    cy.then(() => finishWrite())
    cy.wait("@saveSettings")
  })

  for (const action of ["Escape", "Close"]) {
    it(`returns to the selected grid cell after switching notifications and ${action}`, () => {
      visitConsole()
      let finishCopy
      cy.window().then((win) => {
        win.navigator.clipboard.writeText.onSecondCall().callsFake(
          () =>
            new win.Promise((resolve) => {
              finishCopy = resolve
            }),
        )
      })
      cy.typeQuery("select value from focus_probe;")
      cy.getByDataHook("button-run-query").click()
      cy.get("#cell-0-0").realClick()
      cy.realPress("ArrowDown")
      cy.get('[role="grid"]').should(
        "have.attr",
        "aria-activedescendant",
        "cell-1-0",
      )
      cy.realPress(["Control", "c"])
      cy.get(".Toastify__toast--success").should("have.length", 1)
      // Complete another clipboard operation only after focus has moved to A.
      cy.realPress(["Control", "c"])
      cy.wrap(null).should(() => expect(finishCopy).to.be.a("function"))
      cy.realPress(["Alt", "n"])
      cy.get(".Toastify__toast--success .Toastify__toast-body").should(
        "be.focused",
      )
      cy.then(() => finishCopy())
      cy.get(".Toastify__toast--success")
        .should("have.length", 2)
        .last()
        .should("not.have.class", "Toastify__slide-enter--top-right")
      cy.realPress(["Alt", "n"])
      cy.get(".Toastify__toast--success .Toastify__toast-body")
        .last()
        .should("be.focused")
      if (action === "Escape") {
        cy.realPress("Escape")
      } else {
        cy.get(".Toastify__toast--success .Toastify__close-button")
          .last()
          .realClick()
      }
      cy.get('[role="grid"]')
        .should("be.focused")
        .and("have.attr", "aria-activedescendant", "cell-1-0")
      cy.realPress("ArrowDown")
      cy.get('[role="grid"]').should(
        "have.attr",
        "aria-activedescendant",
        "cell-2-0",
      )
      cy.realPress(["Control", "c"])
      cy.window()
        .its("navigator.clipboard.writeText")
        .should("have.been.calledWith", "3")
    })
  }

  it("restores result-grid navigation and copy after Alt+N and Escape", () => {
    visitConsole()
    cy.typeQuery("select value from focus_probe;")
    cy.getByDataHook("button-run-query").click()
    cy.get("#cell-0-0").realClick()
    cy.get('[role="grid"]').should("be.focused")
    cy.realPress("ArrowDown")
    cy.get('[role="grid"]').should(
      "have.attr",
      "aria-activedescendant",
      "cell-1-0",
    )
    cy.realPress(["Control", "c"])
    cy.contains(".Toastify__toast--success", "Copied to clipboard").should(
      "be.visible",
    )
    cy.realPress(["Alt", "n"])
    cy.get(".Toastify__toast--success .Toastify__toast-body").should(
      "be.focused",
    )
    cy.realPress("Escape")
    cy.get('[role="grid"]')
      .should("be.focused")
      .and("have.attr", "aria-activedescendant", "cell-1-0")
    cy.realPress("ArrowDown")
    cy.get('[role="grid"]').should(
      "have.attr",
      "aria-activedescendant",
      "cell-2-0",
    )
    cy.realPress(["Control", "c"])
    cy.window()
      .its("navigator.clipboard.writeText")
      .should("have.been.calledWith", "3")
  })

  it("does not restore a previous result's selection after returning from a notification", () => {
    visitConsole()
    cy.typeQuery("select value from focus_probe;")
    cy.getByDataHook("button-run-query").click()
    cy.get("#cell-0-0").should("contain", "1")

    let finishQuery
    cy.intercept("GET", `${baseUrl}/exec*`, (req) => {
      const query = new URL(req.url).searchParams.get("query") ?? ""
      if (!query.includes("replacement_result")) return
      return new Promise((resolve) => {
        finishQuery = () => {
          req.reply({
            body: {
              query,
              columns: [{ name: "value", type: "INT" }],
              dataset: [[10], [20], [30]],
              count: 3,
              timings: { compiler: 0, execute: 0, count: 0, authentication: 0 },
            },
          })
          resolve()
        }
      })
    }).as("replacement")
    cy.typeQuery("select 123 as replacement_result;")
    cy.getByDataHook("button-run-query").click()
    cy.wrap(null).should(() => expect(finishQuery).to.be.a("function"))
    cy.get("#cell-0-0").realClick()
    cy.realPress("ArrowDown")
    cy.get('[role="grid"]').should(
      "have.attr",
      "aria-activedescendant",
      "cell-1-0",
    )
    cy.realPress(["Control", "c"])
    cy.window()
      .its("navigator.clipboard.writeText")
      .should("have.been.calledOnce")
      .and("have.been.calledWith", "2")
    cy.realPress(["Alt", "n"])
    cy.get(".Toastify__toast--success .Toastify__toast-body").should(
      "be.focused",
    )

    cy.then(() => finishQuery())
    cy.wait("@replacement")
    cy.get("#cell-0-0").should("contain", "10")
    cy.get('[role="grid"]').should("not.have.attr", "aria-activedescendant")
    cy.get(".Toastify__toast--success .Toastify__toast-body").should(
      "be.focused",
    )
    cy.realPress("Escape")
    cy.get('[role="grid"]')
      .should("be.focused")
      .and("not.have.attr", "aria-activedescendant")
    cy.realPress(["Control", "c"])
    cy.window()
      .its("navigator.clipboard.writeText")
      .should("have.been.calledOnce")
  })

  it("restores the shortcut origin when a paused toast is manually closed", () => {
    visitConsole()
    showCopyToast()
    cy.getByDataHook("help-panel-button").focus().then(focusNotification)
    cy.get(".Toastify__toast--success .Toastify__toast-body").should(
      "be.focused",
    )
    cy.get(".Toastify__toast--success .Toastify__close-button").click()
    cy.get(".Toastify__toast--success").should("not.exist")
    cy.getByDataHook("help-panel-button").should("be.focused")
  })
})
