/// <reference types="cypress" />
const baseUrl = Cypress.config("baseUrl")
const headers = { Authorization: `Basic ${btoa("admin:quest")}` }
let user
let originalPreferences

const writePreferences = (preferences) => {
  cy.request({ url: `${baseUrl}/settings`, headers }).then(({ body }) => {
    cy.request({
      method: "PUT",
      url: `${baseUrl}/settings`,
      headers,
      qs: { version: body["preferences.version"] },
      body: preferences,
    })
  })
}

const watchPermissions = (username) => {
  cy.intercept("GET", "**/exec?*", (req) => {
    const sql = new URL(req.url).searchParams.get("query")
    if (
      sql?.toLowerCase().startsWith("show permissions") &&
      sql.includes(username)
    )
      req.alias = "permissions"
    if (sql === "select current_user()") req.alias = "editorIdentity"
  })
}

const runIdentity = (username) => {
  cy.getEditor().should("be.visible")
  cy.clickRunIconInLine(1)
  cy.wait("@editorIdentity").its("response.statusCode").should("equal", 200)
  cy.getGridRow(0).should("contain", username)
}

describe("Enterprise instance settings permissions", () => {
  afterEach(() => {
    if (user) cy.execAdminQuery(`DROP USER '${user}'`)
    if (originalPreferences) writePreferences(originalPreferences)
    user = undefined
    originalPreferences = undefined
  })

  it("allows the real administrator to edit instance settings", () => {
    // Given
    cy.request({ url: `${baseUrl}/settings`, headers }).then(({ body }) => {
      originalPreferences = body.preferences
      writePreferences({
        ...body.preferences,
        instance_name: "",
        instance_type: "",
        instance_description: "",
        instance_rgb: "",
      })
    })
    watchPermissions("admin")

    // When
    cy.loadConsoleWithAuth(
      false,
      {},
      { buffers: [{ value: "select current_user()" }] },
    )

    // Then
    cy.wait("@permissions").then(({ response }) => {
      expect(response.statusCode).to.equal(200)
      expect(response.body.dataset).to.deep.equal([])
    })
    cy.getByDataHook("topbar-instance-name").should(
      "have.text",
      "Instance name is not set",
    )
    cy.getByDataHook("topbar-instance-badge").should(
      "have.css",
      "background-color",
      "rgba(0, 0, 0, 0)",
    )
    runIdentity("admin")
    cy.getByDataHook("topbar-instance-edit-icon").should("be.visible")
  })

  it("denies editing with HTTP alone and allows it after SETTINGS is granted and the console reloads", () => {
    // Given
    // The dot guards #446: the permission check must quote the user name.
    user = `settings.review.${Date.now()}_${Cypress._.random(100000)}`
    cy.execAdminQuery(`CREATE USER '${user}' WITH PASSWORD 'pwd'`)
    cy.execAdminQuery(`GRANT HTTP TO '${user}'`)
    watchPermissions(user)
    const options = {
      username: user,
      password: "pwd",
      buffers: [{ value: "select current_user()" }],
    }

    // When
    cy.loadConsoleWithAuth(false, {}, options)

    // Then
    cy.wait("@permissions").then(({ response }) => {
      expect(response.statusCode).to.equal(200)
      expect(JSON.stringify(response.body.dataset)).not.to.contain("SETTINGS")
    })
    runIdentity(user)
    cy.getByDataHook("topbar-instance-edit-icon").should("not.exist")

    // When
    cy.execAdminQuery(`GRANT SETTINGS TO '${user}'`)
    cy.loadConsoleWithAuth(false, {}, options)

    // Then
    cy.wait("@permissions").then(({ response }) => {
      expect(response.statusCode).to.equal(200)
      expect(JSON.stringify(response.body.dataset)).to.contain("SETTINGS")
    })
    runIdentity(user)
    cy.getByDataHook("topbar-instance-edit-icon").should("be.visible")
  })
})
