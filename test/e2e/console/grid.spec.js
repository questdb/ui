/// <reference types="cypress" />
import { resizeGridColumn, freezeGridThrough } from "../utils/gridInteractions"

const loadGridConsole = (query) =>
  cy.loadConsoleWithAuth(false, {}, { buffers: [{ value: query }] })

const rowHeight = 30
const headerHeight = 44
const threeColumnQuery = "select x a, x b, x c from long_sequence(20)"

const expectHeaders = (names) =>
  cy.get('[data-hook="grid-header-name"]').should(($headers) => {
    expect([...$headers].map((header) => header.textContent)).to.deep.equal(
      names,
    )
  })

const widthForColumn = (name) =>
  cy.get('[data-hook="grid-header-name"]').then(($headers) => {
    const column = [...$headers].findIndex(
      (header) => header.textContent === name,
    )
    return cy
      .getGridCellAt(0, column)
      .then(($cell) => $cell[0].getBoundingClientRect().width)
  })

const expectColumnWidth = (name, width) =>
  cy.get('[data-hook="grid-header-name"]').should(($headers) => {
    const column = [...$headers].findIndex(
      (header) => header.textContent === name,
    )
    const cell = $headers[0].ownerDocument.getElementById(`cell-0-${column}`)
    expect(cell.getBoundingClientRect().width).to.be.closeTo(width, 2)
  })

describe("questdb grid", () => {
  it("keeps loaded rows after a server page fails and can run another query", () => {
    // Given
    const query =
      "select case when x > 1000 then simulate_crash('0') else false end crash from long_sequence(1200)"
    loadGridConsole(query)
    cy.intercept("**/exec*", (request) => {
      if (
        request.query.query === query &&
        Number(String(request.query.limit).split(",")[0]) > 0
      ) {
        request.alias = "failedPage"
      }
    })
    cy.runLine()
    cy.getGridCellAt(0, 0).should("have.text", "false")
    cy.getCollapsedNotifications().should("contain", "1,200 rows in")

    // When
    cy.getGridViewport().scrollTo("bottom")
    cy.wait("@failedPage")
      .its("response.body.error")
      .should("contain", "simulated cairo exception")

    // Then
    cy.getCollapsedNotifications().should(
      "contain",
      "simulated cairo exception",
    )
    cy.getGridCellAt(1199, 0).should("have.text", "")
    cy.getGridViewport().scrollTo("top")
    cy.getGridCellAt(0, 0).should("have.text", "false")
    cy.getGridCellAt(1, 0).should("have.text", "false")
    cy.typeQueryDirectly("select 42 recovered")
    cy.runLine()
    cy.getGridCellAt(0, 0).should("have.text", "42")
  })

  it("loads deep pages into the correct cells through the server", () => {
    // Given
    const query = "select x a, x * 10 b from long_sequence(5000)"
    loadGridConsole(query)
    cy.intercept("**/exec*", (request) => {
      if (
        request.query.query === query &&
        Number(String(request.query.limit).split(",")[0]) > 1000
      ) {
        request.alias = "deepPage"
      }
    })
    cy.runLine()
    cy.getGridCellAt(0, 0).should("have.text", "1")
    cy.getGridCellAt(0, 1).should("have.text", "10")

    // When / Then
    for (const row of [128, 512, 896]) {
      cy.getGridViewport().scrollTo(0, row * rowHeight)
      cy.getGridCellAt(row, 0)
        .should("have.text", String(row + 1))
        .click()
      cy.getActiveCell().should("have.id", `cell-${row}-0`)
    }
    cy.getGridViewport().scrollTo(0, 2500 * rowHeight)
    cy.wait("@deepPage").its("response.statusCode").should("eq", 200)
    cy.getGridCellAt(2500, 0).should("have.text", "2501")
    cy.getGridCellAt(2500, 1).should("have.text", "25010")
    cy.gridToolbar("markdown").click()
    const markdown = [
      "| a    | b     |",
      "| ---- | ----- |",
      ...Array.from(
        { length: 1000 },
        (_, index) => `| ${index + 2001} | ${(index + 2001) * 10} |`,
      ),
    ].join("\n")
    cy.window()
      .then((win) => win.navigator.clipboard.readText())
      .should("equal", markdown)
    cy.getGridViewport().scrollTo("bottom")
    cy.wait("@deepPage").its("response.statusCode").should("eq", 200)
    cy.getGridCellAt(4999, 0).should("have.text", "5000")
    cy.getGridCellAt(4999, 1).should("have.text", "50000")
  })

  it("returns from a selected result cell to SQL editing with F2", () => {
    // Given
    loadGridConsole("select x from long_sequence(10)")
    cy.runLine()
    cy.selectGridCell(0, 0)

    // When
    cy.realPress("F2")

    // Then
    cy.getActiveCell().should("not.exist")
    cy.getEditor().find("textarea").should("be.focused")
    cy.realPress("End")
    cy.realType(" -- reviewed")
    cy.window().should((win) => {
      expect(win.monaco.editor.getEditors()[0].getValue()).to.equal(
        "select x from long_sequence(10) -- reviewed",
      )
    })
  })

  it("restores a customized layout after rerunning and keeps defaults after resetting", () => {
    // Given
    loadGridConsole(threeColumnQuery)
    cy.runLine()
    const defaults = {}
    for (const name of ["a", "b", "c"]) {
      widthForColumn(name).then((width) => {
        defaults[name] = width
      })
    }
    resizeGridColumn(0, 150)
    cy.then(() => expectColumnWidth("a", defaults.a + 150))
    cy.get('[data-hook="grid-col-resizer"]').first().focus()
    cy.realPress("ArrowRight")
    cy.realPress("ArrowRight")
    cy.realPress("ArrowRight")
    cy.then(() => expectColumnWidth("a", defaults.a + 180))
    cy.window().should((win) => {
      const layouts = Object.values(
        JSON.parse(win.localStorage.getItem("result.grid.layout") || "{}"),
      )
      expect(layouts).to.have.length(1)
      expect(layouts[0].columnSizing).to.deep.equal({ col_0: defaults.a + 180 })
    })
    cy.selectGridCell(0, 0)
    cy.realPress(["Control", "b"])
    cy.then(() => expectColumnWidth("a", defaults.a))
    cy.get("[role=grid]").should("be.focused")
    resizeGridColumn(0, 150)
    let resizedWidth
    widthForColumn("a").then((width) => {
      resizedWidth = width
    })
    cy.selectGridCell(0, 2)
    cy.realPress("/")
    cy.gridToolbar("freeze").click()

    // When
    cy.runLine()

    // Then
    expectHeaders(["c", "a", "b"])
    cy.then(() => expectColumnWidth("a", resizedWidth))
    cy.getGridCellAt(0, 0).should("have.attr", "data-frozen", "true")
    cy.getGridCellAt(0, 1).should("not.have.attr", "data-frozen")
    cy.gridToolbar("freeze").should("have.attr", "data-selected", "true")

    // When / Then
    cy.gridToolbar("reset").click()
    expectHeaders(["a", "b", "c"])
    cy.getFrozenCells().should("have.length", 0)
    cy.gridToolbar("freeze").should("have.attr", "data-selected", "false")
    cy.then(() => {
      for (const name of ["a", "b", "c"])
        expectColumnWidth(name, defaults[name])
    })
    cy.runLine()
    expectHeaders(["a", "b", "c"])
    cy.getFrozenCells().should("have.length", 0)
    cy.gridToolbar("freeze").should("have.attr", "data-selected", "false")
    cy.then(() => {
      for (const name of ["a", "b", "c"])
        expectColumnWidth(name, defaults[name])
    })
  })

  describe("server result metadata", () => {
    const table = "grid_designated_ts"

    afterEach(() => cy.execAdminQuery(`drop table if exists ${table}`))

    it("colors only the timestamp designated by the server", () => {
      // Given
      cy.execAdminQuery(`drop table if exists ${table}`)
      cy.execAdminQuery(
        `create table ${table} (ts timestamp, ts2 timestamp, val long) timestamp(ts)`,
      )
      cy.execAdminQuery(
        `insert into ${table} values('2024-01-01T00:00:00.000000Z','2024-01-01T00:00:00.000000Z',1)`,
      )
      loadGridConsole(`select * from ${table}`)
      cy.intercept("**/exec*", (request) => {
        if (request.query.query === `select * from ${table}`) {
          request.alias = "designatedResult"
        }
      })

      // When
      cy.runLine()

      // Then
      cy.wait("@designatedResult")
        .its("response.body.timestamp")
        .should("eq", 0)
      cy.getGridCellAt(0, 0).should("have.attr", "data-timestamp", "true")
      cy.getGridCellAt(0, 1).should("not.have.attr", "data-timestamp")
      for (const [column, token] of [
        [0, "statusSuccess"],
        [1, "contentPrimary"],
      ]) {
        cy.getGridCellAt(0, column).should(($cell) => {
          const document = $cell[0].ownerDocument
          const expected = document.createElement("span")
          expected.style.color = `var(--qdb-color-${token})`
          document.body.append(expected)
          const color = getComputedStyle(expected).color
          expected.remove()
          expect(getComputedStyle($cell[0]).color).to.equal(color)
        })
      }
    })
  })

  describe("refresh", () => {
    const table = "grid_refresh_result"

    afterEach(() => cy.execAdminQuery(`drop table if exists ${table}`))

    it("refreshes the displayed SQL and replaces old values with changed server data", () => {
      // Given
      const query = `select value from ${table}`
      cy.execAdminQuery(`drop table if exists ${table}`)
      cy.execAdminQuery(`create table ${table} (value long)`)
      cy.execAdminQuery(`insert into ${table} values (1)`)
      loadGridConsole(query)
      cy.runLine()
      cy.getGridCellAt(0, 0).should("have.text", "1")
      cy.execAdminQuery(`update ${table} set value = 42`)
      cy.interceptQuery(query, "refresh")

      // When
      cy.gridToolbar("refresh").click()

      // Then
      cy.wait("@refresh").its("response.statusCode").should("eq", 200)
      cy.getGridCellAt(0, 0).should("have.text", "42")
    })
  })
  it("navigates rows, row edges, grid corners, and pages with the keyboard", () => {
    // Given
    loadGridConsole("select x a, x * 10 b, x * 100 c from long_sequence(200)")
    cy.runLine()
    cy.selectGridCell(0, 0)
    // When / Then
    cy.realPress("ArrowRight")
    cy.realPress("ArrowDown")
    cy.getActiveCell().should("have.id", "cell-1-1").and("have.text", "20")
    cy.realPress("End")
    cy.getActiveCell().should("have.id", "cell-1-2")
    cy.realPress("Home")
    cy.getActiveCell().should("have.id", "cell-1-0")
    cy.realPress(["Control", "End"])
    cy.getActiveCell().should("have.id", "cell-199-2").and("be.visible")
    cy.realPress(["Control", "Home"])
    cy.getActiveCell().should("have.id", "cell-0-0")
    cy.getGridViewport().then(($viewport) => {
      const page = Math.floor(
        ($viewport[0].clientHeight - headerHeight) / rowHeight,
      )
      cy.realPress("PageDown")
      cy.getActiveCell().should("have.id", `cell-${page}-0`)
      cy.realPress("PageUp")
      cy.getActiveCell().should("have.id", "cell-0-0")
    })
  })

  it("replaces empty, null, and renamed results without retaining stale metadata", () => {
    // Given
    loadGridConsole("select x aa from long_sequence(0)")
    cy.runLine()
    cy.getGridViewport().should("be.visible")
    cy.get('[data-hook="grid-row"]').should("not.exist")
    expectHeaders(["aa"])
    // When / Then
    cy.typeQueryDirectly("select cast(null as long) bb")
    cy.runLine()
    expectHeaders(["bb"])
    cy.getGridCellAt(0, 0).should("have.text", "null")
    widthForColumn("bb").then((width) => {
      cy.typeQueryDirectly("select cast(1111 as long) cc")
      cy.runLine()
      expectHeaders(["cc"])
      expectColumnWidth("cc", width)
      cy.getGridCellAt(0, 0).should("have.text", "1111")
    })
  })

  it("copies a cell, its header, and the current page through the native clipboard", () => {
    // Given
    loadGridConsole("select x from long_sequence(5)")
    cy.runLine()
    cy.selectGridCell(0, 0)
    // When / Then
    cy.realPress(["Control", "c"])
    cy.getActiveCell().should("have.attr", "data-pulse", "true")
    cy.window()
      .then((win) => win.navigator.clipboard.readText())
      .should("equal", "1")
    cy.getActiveCell().should("not.have.attr", "data-pulse")
    cy.get('[data-hook="grid-header-name"]').first().realHover()
    cy.getGridHeaderCopy(0).should("be.visible").click()
    cy.window()
      .then((win) => win.navigator.clipboard.readText())
      .should("equal", "x")
    cy.gridToolbar("markdown").click()
    cy.window()
      .then((win) => win.navigator.clipboard.readText())
      .should("equal", "| x |\n| - |\n| 1 |\n| 2 |\n| 3 |\n| 4 |\n| 5 |")
  })

  it("reorders values around a frozen band and adjusts that band with native dragging", () => {
    // Given
    loadGridConsole(
      "select x a, x * 10 b, x * 100 c, x * 1000 d from long_sequence(20)",
    )
    cy.runLine()
    cy.gridToolbar("move-front").should("be.disabled")
    cy.selectGridCell(0, 2)
    cy.gridToolbar("move-front").should("not.be.disabled").click()
    expectHeaders(["c", "a", "b", "d"])
    cy.getGridCellAt(0, 0).should("have.text", "100")
    cy.getActiveCell().should("have.text", "100")
    cy.gridToolbar("reset").click()
    // When / Then
    cy.gridToolbar("freeze").click()
    cy.gridToolbar("freeze").should("have.attr", "data-selected", "true")
    cy.selectGridCell(0, 2)
    cy.gridToolbar("move-front").click()
    expectHeaders(["a", "c", "b", "d"])
    for (const [column, value] of [
      [0, "1"],
      [1, "100"],
      [2, "10"],
      [3, "1000"],
    ])
      cy.getGridCellAt(0, column).should("have.text", value)
    cy.getGridCellAt(0, 0).should("have.attr", "data-frozen", "true")
    freezeGridThrough(1)
    cy.getGridCellAt(0, 1).should("have.attr", "data-frozen", "true")
    cy.gridToolbar("freeze").click()
    cy.getFrozenCells().should("have.length", 0)
    cy.gridToolbar("freeze").should("have.attr", "data-selected", "false")
    for (const column of [1, 2]) {
      freezeGridThrough(column)
      cy.getGridCellAt(0, column).should("have.attr", "data-frozen", "true")
      cy.getGridCellAt(0, column + 1).should("not.have.attr", "data-frozen")
    }
    cy.runLine()
    cy.gridToolbar("move-front").should("be.disabled")
  })

  it("keeps the frozen column stationary while scrolling to the last column", () => {
    // Given
    const columns = Array.from({ length: 100 }, (_, i) => `x c${i}`).join(", ")
    loadGridConsole(`select ${columns} from long_sequence(10)`)
    cy.runLine()
    cy.gridToolbar("freeze").click()
    // When / Then
    cy.getGridCellAt(0, 0).then(($cell) => {
      const left = $cell[0].getBoundingClientRect().left
      cy.getGridViewport().scrollTo("right")
      cy.getGridViewport().should(($viewport) =>
        expect($viewport[0].scrollLeft).to.be.greaterThan(0),
      )
      cy.getGridCellAt(0, 99).should("be.visible").and("have.text", "1")
      cy.getGridCellAt(0, 0).should(($frozen) =>
        expect($frozen[0].getBoundingClientRect().left).to.be.closeTo(left, 2),
      )
      cy.get('[data-hook="grid-frozen-shadow"]').should("be.visible")
    })
  })

  it("delays a clipped cell preview and clears it when results are replaced", () => {
    // Given
    const query = "select rpad('a', 500, 'b') wide from long_sequence(1)"
    loadGridConsole(query)
    cy.runLine()
    // The first layout can size the column to its full content width; hover
    // only once it is clamped, or the pointer lands outside the viewport
    cy.getGridCellAt(0, 0).should(($cell) => {
      const viewport = $cell[0].closest('[data-hook="grid-viewport"]')
      expect($cell[0].getBoundingClientRect().right).to.be.at.most(
        viewport.getBoundingClientRect().right,
      )
    })
    cy.clock(Date.now(), ["setTimeout", "clearTimeout"])
    cy.getGridCellAt(0, 0).realHover()
    // When / Then
    cy.tick(699)
    cy.get('[data-hook="grid-cell-tooltip-value"]').should("not.exist")
    cy.tick(1)
    cy.get('[data-hook="grid-cell-tooltip-value"]')
      .first()
      .should("have.text", "a" + "b".repeat(399))
    cy.contains("+100 more characters").should("be.visible")
    cy.clock().invoke("restore")
    cy.intercept("**/exec*", (request) => {
      if (request.query.query === query) request.alias = "sameTooltipResult"
    })
    cy.gridToolbar("refresh").then(($button) => $button[0].click())
    cy.wait("@sameTooltipResult")
    cy.get('[data-hook="grid-cell-tooltip-value"]').should("not.exist")
    cy.getGridCellAt(0, 0).should("have.text", "a" + "b".repeat(499))
    cy.get('[data-hook="grid-header-name"]').first().realHover()
    cy.getGridCellAt(0, 0).realHover()
    cy.get('[data-hook="grid-cell-tooltip-value"]').should("exist")
    cy.intercept("**/exec*", (request) => {
      if (request.query.query === query) {
        request.alias = "replacedTooltipResult"
        request.continue((response) => {
          response.body.dataset = [["c" + "d".repeat(499)]]
        })
      }
    })
    cy.gridToolbar("refresh").then(($button) => $button[0].click())
    cy.wait("@replacedTooltipResult")
    cy.get('[data-hook="grid-cell-tooltip-value"]').should("not.exist")
    cy.getGridCellAt(0, 0).should("have.text", "c" + "d".repeat(499))
  })

  it("adapts column widths as result shapes change", () => {
    const longArray = (n) =>
      `ARRAY[${Array.from({ length: n }, (_, i) => `${i + 1}.0`).join(",")}]`
    const gridArea = () => cy.get('[data-hook="result-grid-tanstack"]:visible')
    const cellIn = (column) => gridArea().find(`#cell-0-${column}`)
    let first = true
    const runQuery = (query) => {
      if (first) {
        loadGridConsole(query)
        first = false
      } else cy.typeQueryDirectly(query)
      cy.runLine()
      cellIn(0).should("be.visible")
    }

    // Given a result with one very long column
    runQuery("select string_agg(x::string, ',') s from long_sequence(500)")

    // Then it stretches to the full grid width — asserted retryably, since
    // widths re-measure and expand once the webfont finishes loading
    gridArea().should(($grid) => {
      const gridWidth = $grid[0].getBoundingClientRect().width
      const cellWidth = $grid.find("#cell-0-0")[0].getBoundingClientRect().width
      expect(cellWidth).to.be.closeTo(gridWidth, 20)
    })

    // Given a result with two very wide columns
    runQuery(
      `select string_agg(x::string, ',') s, ${longArray(300)} arr from long_sequence(500)`,
    )

    // Then each column takes half of the grid width — asserted retryably,
    // since widths re-measure and expand once the webfont finishes loading
    gridArea().should(($grid) => {
      const gridWidth = $grid[0].getBoundingClientRect().width
      const firstWidth = $grid
        .find("#cell-0-0")[0]
        .getBoundingClientRect().width
      const secondWidth = $grid
        .find("#cell-0-1")[0]
        .getBoundingClientRect().width
      expect(firstWidth).to.be.closeTo(secondWidth, 8)
      expect(firstWidth).to.be.closeTo(gridWidth / 2, 20)
    })

    // And the clipped array ends with an ellipsis before its closing bracket
    cellIn(1)
      .invoke("text")
      .then((text) => {
        expect(text.trim()).to.match(/\.\.\.]$/)
      })

    // Given a few narrow columns and one wide array column
    runQuery(`select 1, 2, 3, ${longArray(300)} arr`)

    // Then the narrow columns settle at one small, shared width, and the
    // array column takes exactly what they leave behind — asserted retryably,
    // since widths re-measure and expand once the webfont finishes loading
    gridArea().should(($grid) => {
      const gridWidth = $grid[0].getBoundingClientRect().width
      const widths = [0, 1, 2, 3].map(
        (col) => $grid.find(`#cell-0-${col}`)[0].getBoundingClientRect().width,
      )
      expect(widths[1]).to.be.closeTo(widths[0], 8)
      expect(widths[2]).to.be.closeTo(widths[0], 8)
      const digitsTotal = widths[0] + widths[1] + widths[2]
      expect(widths[3]).to.be.closeTo(gridWidth - digitsTotal, 20)
    })

    const digits = Array.from({ length: 100 }, (_, i) => i + 1).join(",")

    // Given more narrow columns than the width can hold, plus a wide array
    runQuery(`select ${digits}, ${longArray(300)} arr`)

    // When the far-right array column is scrolled into view
    gridArea().find('[data-hook="grid-viewport"]').scrollTo("right")

    // Then it settles at the maximum column width
    cellIn(100)
      .should("be.visible")
      .should(($cell) => {
        expect($cell[0].getBoundingClientRect().width).to.be.closeTo(400, 3)
      })
  })
})
