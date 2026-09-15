/// <reference types="cypress" />

const pairQuery = "select 'EURUSD' as symbol"
const cellSql = "select @pair as chosen"
const rangeQuery =
  "select cast(@timeFrom as string) as range_value from variable_ranges limit 1"
const firstRange = { from: "2025-01-01", to: "2025-01-02" }
const nextRange = { from: "2025-01-03", to: "2025-01-04" }
const queryOf = (call) => new URL(call.request.url).searchParams.get("query")
const setCalendarRange = ({ from, to }) => {
  cy.getByDataHook("notebook-time-range").click()
  cy.getByDataHook("time-range-dateFrom").clear().type(from)
  cy.getByDataHook("time-range-dateTo").clear().type(to)
  cy.getByDataHook("time-range-apply").click()
}
const expectRange = (state, range) => {
  expect(new Date(state.settings.timeRange.from).toISOString()).to.equal(
    `${range.from}T00:00:00.000Z`,
  )
  expect(new Date(state.settings.timeRange.to).toISOString()).to.equal(
    `${range.to}T00:00:00.000Z`,
  )
}
const cellRequest = (value) => ({
  id: null,
  name: null,
  value,
  preserve_value: null,
  type: "sql",
  mode: "run",
  auto_refresh: null,
  editor_height: null,
  result_height: null,
  view: null,
  chart_config: null,
  grid: null,
})

describe("Notebook variables", () => {
  beforeEach(() => {
    cy.loadConsoleWithAuth()
  })

  after(() => {
    cy.dropTableIfExists("variable_offsets")
    cy.dropTableIfExists("variable_ranges")
  })

  it("shares globals, rejects duplicate names, and preserves reordered declarations after reopening", () => {
    // Given a shared device and a notebook-specific threshold.
    cy.createNotebook()
    cy.getByDataHook("notebook-variables").click()
    cy.addNotebookVariable({
      name: "device",
      kind: "text",
      value: "'sensor-a'",
      scope: "global",
    })
    cy.getByDataHook("variable-text-value").should(
      "have.attr",
      "aria-label",
      "Default value",
    )
    cy.addNotebookVariable({
      name: "region",
      kind: "fixed",
      value: "'east'",
      scope: "global",
    })
    cy.addNotebookVariable({ name: "threshold", kind: "fixed", value: "5" })
    cy.applyNotebookVariables()

    // When another notebook attempts to define the same global name with different case.
    cy.createNotebook()
    cy.getByDataHook("notebook-variables").click()
    cy.addNotebookVariable({
      name: "DEVICE",
      kind: "text",
      value: "'sensor-b'",
    })
    cy.getByDataHook("variables-apply").click()
    // Then the duplicate cannot override the shared device.
    cy.getByDataHook("variable-problem").should("contain", "already defined")
    cy.getByDataHook("variables-dialog").should("be.visible")

    // When the user gives the local variable its own name and edits the shared value.
    cy.getByDataHook("variable-name").clear().type("comparison")
    cy.applyNotebookVariables()
    cy.getByDataHook("variable-text-device").clear().type("'sensor-c'{enter}")
    cy.getByDataHook("notebook-variables").should(
      "have.attr",
      "aria-busy",
      "false",
    )
    cy.runNotebookQuery("select @device as device, @comparison as comparison")
    // Then both distinct values reach the query and survive a reload.
    cy.getGridRow(0).should("contain", "sensor-c").and("contain", "sensor-b")
    cy.selectNotebook("Notebook 1")
    cy.getByDataHook("variable-text-device").should("have.value", "'sensor-c'")
    cy.runNotebookQuery("select @device as device, @threshold as threshold")
    cy.getGridRow(0).should("contain", "sensor-c").and("contain", "5")

    // When only the global order changes before a reload.
    cy.getByDataHook("notebook-variables").click()
    cy.moveNotebookVariableBefore("region", "device")
    cy.getByDataHook("variables-global-section").within(() => {
      cy.getByDataHook("variable-row").first().should("contain", "@region")
    })
    cy.applyNotebookVariables()
    cy.reload()

    // Then the saved order and values survive together.
    cy.getByDataHook("variable-text-device").should("have.value", "'sensor-c'")
    cy.getByDataHook("notebook-variables").click()
    cy.getByDataHook("variables-global-section").within(() => {
      cy.getByDataHook("variable-row").eq(0).should("contain", "@region")
      cy.getByDataHook("variable-row").eq(1).should("contain", "@device")
    })
    cy.getByDataHook("variables-dialog").type("{esc}")
    cy.runNotebookQuery(
      "select @device as restored_device, @threshold as restored_threshold",
    )
    cy.getGridRow(0).should("contain", "sensor-c").and("contain", "5")
  })

  it("selects cached values, refreshes dependencies, and runs with one completed set of values", () => {
    // Given two independent lists and a query that depends on one selection.
    cy.dropTableIfExists("variable_offsets")
    cy.execQuery("create table variable_offsets as (select 10 as amount)")
    cy.createNotebook()
    cy.getByDataHook("notebook-variables").click()
    cy.addNotebookVariable({
      name: "desk",
      kind: "custom",
      value: "select x from long_sequence(2)",
    })
    cy.addNotebookVariable({
      name: "account",
      kind: "custom",
      value: "select x from long_sequence(2)",
    })
    cy.applyNotebookVariables()
    cy.selectNotebookVariable("desk", "1")
    cy.selectNotebookVariable("account", "1")
    cy.getByDataHook("notebook-variables").click()
    cy.addNotebookVariable({
      name: "adjusted",
      kind: "custom",
      value: "select @account + amount as child_value from variable_offsets",
    })
    cy.applyNotebookVariables()
    cy.intercept("**/exec*").as("queries")
    cy.intercept("**/chk*").as("checks")
    cy.intercept("**/api/v1/sql/validate*").as("validations")

    // When an independent selection changes.
    cy.selectNotebookVariable("desk", "2")
    // Then it uses cached values without fetching or validating SQL.
    cy.getByDataHook("variable-list-desk").should("contain", "2")
    cy.get("@queries.all").should("have.length", 0)
    cy.get("@checks.all").should("have.length", 0)
    cy.get("@validations.all").should("have.length", 0)

    // When a dependent fetch is pending and the user runs a cell.
    cy.holdQueryResponse("as child_value", "dependentValues").as(
      "pendingValues",
    )
    cy.selectNotebookVariable("account", "2")
    cy.getByDataHook("notebook-variables").should(
      "have.attr",
      "aria-busy",
      "true",
    )
    cy.getNotebookVariableState().then(({ settings, options }) => {
      expect(
        settings.variables.find((variable) => variable.name === "account")
          .selected[0].value,
      ).to.equal("1")
      expect(
        options.find((option) => option.name === "adjusted").options[0].value,
      ).to.equal("11")
    })
    cy.runNotebookQuery(
      "select @desk as desk, @account as account, @adjusted as adjusted",
    )
    cy.get("@queries.all").should((calls) => {
      expect(
        calls.filter((call) => queryOf(call).includes("as adjusted")),
      ).to.have.length(0)
    })
    cy.get("@pendingValues").invoke("release")
    cy.wait("@dependentValues")
    // Then the run uses the new selection and its new dependent value together.
    cy.getGridRow(0).should("contain", "12")
    cy.getByDataHook("variable-list-account").should("contain", "2")
    cy.get("@queries.all").should((calls) => {
      expect(
        calls.filter((call) =>
          queryOf(call).includes("select x from long_sequence"),
        ),
      ).to.have.length(0)
      const run = calls.find((call) => queryOf(call).includes("as adjusted"))
      expect(queryOf(run))
        .to.include("@account := 2")
        .and.include("@adjusted := 12")
    })

    // When server data changes and the user refreshes the parent list.
    cy.execQuery("update variable_offsets set amount = 20")
    cy.getByDataHook("variable-list-account").click()
    cy.getByDataHook("variable-list-refresh").click()
    cy.getByDataHook("notebook-variables").should(
      "have.attr",
      "aria-busy",
      "false",
    )
    cy.getByDataHook("variable-list-account").click()
    cy.runNotebookQuery("select @adjusted as refreshed")
    // Then the dependent query uses the refreshed server data.
    cy.getGridRow(0).should("contain", "22")
    cy.dropTable("variable_offsets")
  })

  it("navigates large lists, searches values, commits multiple selections, and retains stale selections", () => {
    // Given a large list and a multi-value filter.
    cy.createNotebook()
    cy.getByDataHook("notebook-variables").click()
    cy.addNotebookVariable({
      name: "instrument",
      kind: "custom",
      value: "select x from long_sequence(10000)",
    })
    cy.addNotebookVariable({
      name: "venues",
      kind: "custom",
      value: "select x from long_sequence(10000)",
      allValue: "-1",
      multi: true,
    })
    cy.applyNotebookVariables()

    cy.getByDataHook("variable-errors").should("not.exist")

    // When the user navigates to the final instrument using the keyboard.
    cy.getByDataHook("variable-list-instrument").click()
    cy.getByDataHook("variable-list-option")
      .its("length")
      .should("be.lessThan", 80)
    cy.getByDataHook("variable-list-search").type("{downarrow}")
    cy.focused().type("{end}")
    cy.getByDataHook("variable-list-option")
      .filter("[data-highlighted]")
      .should("have.text", "10000")
      .and("be.visible")
    cy.focused().type("{home}")
    cy.getByDataHook("variable-list-option")
      .filter("[data-highlighted]")
      .should("have.text", "All")
    cy.focused().type("{pagedown}")
    cy.getByDataHook("variable-list-option")
      .filter("[data-highlighted]")
      .invoke("attr", "aria-posinset")
      .then((position) => expect(Number(position)).to.be.greaterThan(1))
    cy.focused().type("{end}{enter}")
    // Then the selection closes the picker and remains visible when reopened.
    cy.getByDataHook("variable-list-instrument")
      .should("contain", "10000")
      .click()
    cy.getByDataHook("variable-list-option")
      .filter('[aria-selected="true"]')
      .should("have.text", "10000")
      .and("be.visible")
    cy.getByDataHook("variable-list-option")
      .its("length")
      .should("be.lessThan", 80)
    cy.getByDataHook("variable-list-search").type("missing")
    cy.getByDataHook("variable-list-empty").should(
      "contain",
      "No matching values",
    )
    cy.getByDataHook("variable-list-search").clear().type("10000{downarrow}")
    cy.focused().type("{enter}")

    // When multiple venues are selected, changes remain drafts until dismissal.
    cy.getByDataHook("variable-list-venues").click()
    cy.getByDataHook("variable-list-search").type("10000{downarrow}")
    cy.focused().type(" ")
    cy.getNotebookVariableState().then(({ settings }) =>
      expect(settings.variables[1].selected).to.equal("all"),
    )
    cy.getByDataHook("variable-list-search").clear().type("9999{downarrow}")
    cy.focused().type(" {esc}")
    cy.getByDataHook("variable-list-venues")
      .should("contain", "10000")
      .and("contain", "9999")
    cy.runNotebookQuery(
      "select x from long_sequence(10000) where x in @venues order by x",
    )
    // Then the cell uses both selected values.
    cy.getGridRow(0).should("contain", "9999")
    cy.getGridRow(1).should("contain", "10000")
    cy.getByDataHook("variable-list-venues").click()
    cy.getByDataHook("variable-list-search").type("{downarrow}")
    cy.focused().type("{home}")
    cy.getByDataHook("variable-list-option")
      .filter("[data-highlighted]")
      .should("have.text", "All")
    cy.focused().type("{enter}")
    cy.getByDataHook("variable-list-venues").click().should("contain", "All")

    // When an instrument disappears from the available values.
    cy.getByDataHook("notebook-variables").click()
    cy.getByDataHook("variable-row").contains("instrument").click()
    cy.setSqlInput("variable-query", "select x from long_sequence(9999)")
    cy.applyNotebookVariables()
    // Then its saved selection stays visible and survives a reload.
    cy.getByDataHook("variable-list-instrument").click()
    cy.getByDataHook("variable-list-option")
      .filter('[aria-selected="true"]')
      .should("contain", "10000 (not in current values)")
      .and("be.visible")
    cy.getByDataHook("variable-list-instrument").click()
    cy.reload()
    cy.getByDataHook("variable-list-instrument").should("contain", "10000")
    cy.getByDataHook("variable-list-venues").should("contain", "All")
  })

  it("cancels pending time changes, commits completed ranges, and recovers from variable errors", () => {
    // Given a list whose values depend on the selected time range.
    cy.dropTableIfExists("variable_ranges")
    cy.execQuery("create table variable_ranges as (select 1 as id)")
    cy.createNotebook()
    setCalendarRange(firstRange)
    cy.getByDataHook("time-range-picker").should("not.exist")
    cy.getByDataHook("notebook-variables").click()
    cy.addNotebookVariable({
      name: "rangeValue",
      kind: "custom",
      value: rangeQuery,
    })
    cy.applyNotebookVariables()
    cy.getNotebookVariableState().as("originalVariables")

    // When the user dismisses a pending change through each supported route.
    for (const dismiss of ["escape", "outside", "trigger"]) {
      cy.holdQueryResponse(rangeQuery, "rangeValues").as("pendingRange")
      setCalendarRange(nextRange)
      cy.getByDataHook("time-range-status").should("contain", "Loading values")
      cy.get("@pendingRange").its("received").should("equal", true)
      cy.getNotebookVariableState().then((state) => {
        cy.get("@originalVariables").then((original) =>
          expect(state).to.deep.equal(original),
        )
      })
      if (dismiss === "escape")
        cy.getByDataHook("time-range-dateFrom").type("{esc}")
      else if (dismiss === "outside")
        cy.getByDataHook("notebook-toolbar-name").click()
      else cy.getByDataHook("notebook-time-range").click()
      cy.getByDataHook("time-range-picker").should("not.exist")
      cy.get("@pendingRange").invoke("release")
      cy.getByDataHook("notebook-variables").should(
        "have.attr",
        "aria-busy",
        "false",
      )
      // Then neither the time range nor the list values change.
      cy.getNotebookVariableState().then((state) => {
        cy.get("@originalVariables").then((original) =>
          expect(state).to.deep.equal(original),
        )
      })
    }

    // When calendar changes finish successfully.
    cy.holdQueryResponse(rangeQuery, "appliedRange").as("pendingRange")
    setCalendarRange(nextRange)
    cy.getByDataHook("time-range-status").should("contain", "Loading values")
    cy.getNotebookVariableState().then((state) =>
      expectRange(state, firstRange),
    )
    cy.get("@pendingRange").invoke("release")
    cy.wait("@appliedRange")
    // Then the range and fetched value commit together.
    cy.getByDataHook("time-range-picker").should("not.exist")
    cy.getNotebookVariableState().then((state) => {
      expectRange(state, nextRange)
      expect(state.options[0].options[0].value).to.contain(nextRange.from)
    })
    cy.runNotebookQuery("select @rangeValue as committed_range")
    cy.getGridRow(0).should("contain", nextRange.from)

    // When the table disappears and the user applies a preset.
    cy.dropTable("variable_ranges")
    cy.getByDataHook("notebook-time-range").click()
    cy.getByDataHook("time-range-preset")
      .contains(/^Last 1h$/)
      .click()
    // Then the new range commits and the variables trigger explains the error.
    cy.getByDataHook("time-range-picker").should("not.exist")
    cy.getNotebookVariableState().then(({ settings, options }) => {
      expect(settings.timeRange).to.deep.equal({ from: "now-1h", to: "now" })
      expect(options).to.deep.equal([])
    })
    cy.getByDataHook("variable-errors").should("be.visible")
    cy.hoverForTooltip(() => cy.getByDataHook("notebook-variables"))
    cy.getByRole("tooltip").should(
      "contain",
      "Some variables cannot be applied",
    )
    cy.getByDataHook("notebook-variables").click()
    cy.getByDataHook("variable-problem").should("contain", "variable_ranges")
    cy.getByDataHook("variable-name").type("{esc}")

    // When the table returns, a new preset restores the list.
    cy.execQuery("create table variable_ranges as (select 1 as id)")
    cy.holdQueryResponse(rangeQuery, "presetValues").as("pendingPreset")
    cy.getByDataHook("notebook-time-range").click()
    cy.getByDataHook("time-range-preset")
      .contains(/^Last 6h$/)
      .click()
    cy.getByDataHook("time-range-status").should("contain", "Loading values")
    cy.getNotebookVariableState().then(({ settings, options }) => {
      expect(settings.timeRange).to.deep.equal({ from: "now-1h", to: "now" })
      expect(options).to.deep.equal([])
    })
    cy.get("@pendingPreset").invoke("release")
    cy.wait("@presetValues")
    cy.getByDataHook("time-range-picker").should("not.exist")
    cy.getByDataHook("variable-errors").should("not.exist")
    // Clearing the range reports the missing dependency; restoring it recovers again.
    cy.getByDataHook("notebook-time-range").click()
    cy.getByDataHook("time-range-clear").click()
    cy.getByDataHook("time-range-picker").should("not.exist")
    cy.getByDataHook("variable-errors").should("be.visible")
    cy.getNotebookVariableState().then(({ settings, options }) => {
      expect(settings.timeRange).to.equal(undefined)
      expect(options).to.deep.equal([])
    })
    setCalendarRange(firstRange)
    cy.getByDataHook("time-range-picker").should("not.exist")
    cy.getByDataHook("variable-errors").should("not.exist")
    cy.runNotebookQuery("select @rangeValue as restored_range")
    cy.getGridRow(0).should("contain", firstRange.from)
    cy.dropTable("variable_ranges")
  })

  it("prepares agent changes before execution and shows cached list values during reload", () => {
    // Given an authenticated console connected to the agent bridge.
    cy.connectMcpBridge()
    cy.intercept("**/exec*").as("queries")

    // When the agent creates and runs a notebook in the background.
    cy.callMcpTool("create_notebook", { label: "Variables NB" }).then(
      (created) => {
        cy.callMcpTool("get_notebook_state", { buffer_id: created.bufferId })
        cy.callMcpTool("apply_notebook_state", {
          buffer_id: created.bufferId,
          layout_mode: null,
          auto_refresh_default: null,
          maximized_cell_id: null,
          variables: [
            {
              name: "pair",
              kind: "list",
              source: { type: "query", query: pairQuery, refresh: "onLoad" },
              sort: "none",
              multi: true,
              include_all: true,
              all: { mode: "list" },
              selected: "all",
            },
          ],
          cells: [cellRequest(cellSql)],
        }).then((applied) => {
          // Then preparation finishes before either the initial or subsequent run.
          expect(applied.variable_values).to.have.length(1)
          expect(applied.variable_values[0]).to.include({
            name: "pair",
            count: 1,
          })
          expect(applied.runs[0].success).to.equal(true)
          cy.callMcpTool("run_cell", {
            buffer_id: created.bufferId,
            cell_id: applied.applied.added[0],
          }).then((run) => expect(run.success).to.equal(true))
          cy.get("@queries.all").should((calls) => {
            const queries = calls.map(queryOf)
            expect(
              queries.filter((query) => query.includes(pairQuery)),
            ).to.have.length(1)
            expect(
              queries.filter(
                (query) =>
                  query.includes(cellSql) &&
                  query.includes("@pair := 'EURUSD'"),
              ),
            ).to.have.length(2)
          })
        })
        // When the user opens the notebook.
        cy.callMcpTool("activate_notebook", {
          buffer_id: created.bufferId,
          cell_to_focus: null,
        }).then((activated) => {
          expect(
            activated.variable_values.map((variable) => variable.name),
          ).to.include("pair")
        })
        cy.getEditorTabByTitle("Variables NB").should("have.attr", "active")
        cy.getByDataHook("variable-list-pair").should("be.visible")
      },
    )

    // When the page reloads while the list response is held.
    cy.holdQueryResponse(pairQuery, "reloadedValues").as("pendingReload")
    cy.reload()
    cy.getByDataHook("variable-list-pair").click()
    // Then cached values remain available until the real server response completes.
    cy.getByDataHook("variable-list-status-pair").should(
      "contain",
      "Loading values",
    )
    cy.containsByDataHook("variable-list-option", "EURUSD").should("be.visible")
    cy.get("@pendingReload").invoke("release")
    cy.wait("@reloadedValues")
    cy.getByDataHook("variable-list-status-pair").should(
      "not.contain",
      "Loading values",
    )
    cy.containsByDataHook("variable-list-option", "EURUSD").should("be.visible")
  })
})
