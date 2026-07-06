/// <reference types="cypress" />

const rowHeight = 30

const threeColumnQuery = "select x a, x b, x c from long_sequence(20)"

const distinctColumnQuery =
  "select x a, x * 10 b, x * 100 c from long_sequence(20)"

const readClipboard = () =>
  cy
    .window()
    .its("navigator.clipboard")
    .then((clip) => clip.readText())

describe("questdb grid", () => {
  beforeEach(() => {
    cy.loadConsoleWithAuth()
  })

  describe("rendering and pagination", () => {
    it("when results empty", () => {
      cy.typeQuery("select x from long_sequence(0)")
      cy.runLine()
      cy.getGridViewport().should("be.visible")
      // Scoped from the viewport so the zero-length assertion doesn't wait for
      // a grid-row that legitimately never appears.
      cy.get("[data-hook='grid-row']").should("have.length", 0)
    })

    it("when results have vertical scroll", () => {
      cy.typeQuery(`select x from long_sequence(100)`)
      cy.runLine()
      cy.wait(100)

      // The grid fills the viewport with the first rows...
      cy.getGridRow(0).should("contain", "1")
      cy.getGridRows().should("have.length.greaterThan", 5)

      // ...and scrolling to the bottom brings the last row into view.
      cy.getGridViewport().scrollTo("bottom")
      cy.contains("[data-hook='grid-row']", "100").should("be.visible")
    })

    it("multiple scrolls till the bottom", () => {
      const rows = 1000
      const rowsPerPage = 128
      cy.typeQuery(`select x from long_sequence(${rows})`)
      cy.runLine()

      for (let i = 0; i < rows; i += rowsPerPage) {
        cy.getGridViewport().scrollTo(0, i * rowHeight)
        cy.wait(100)
        cy.getGrid()
          .contains(i + 1)
          .click()
      }

      cy.getGridViewport().scrollTo("bottom")
    })

    it("multiple scrolls till the bottom with error", () => {
      const rows = 1200
      cy.typeQuery(`select simulate_crash('P') from long_sequence(${rows})`)
      cy.runLine()

      cy.getGridViewport().scrollTo(0, 999 * rowHeight)
      cy.getCollapsedNotifications().should("contain", "1,200 rows in")

      cy.getGridViewport().scrollTo("bottom")
      cy.wait(100)
      cy.getCollapsedNotifications().should(
        "contain",
        "simulated cairo exception",
      )

      cy.get("[data-hook='grid-cell']").should("not.contain", "undefined")
    })

    it("deep pages lazily load the correct value into the correct cell", () => {
      // Given a result several pages deep (the seed page holds 1000 rows)
      cy.typeQuery("select x a, x * 10 b from long_sequence(5000)")
      cy.runLine()
      cy.wait(100)

      // When scrolling far past the seed page so a later page lazily loads
      cy.getGridViewport().scrollTo(0, 2500 * rowHeight)

      // Then row 2500 shows its true values in both columns, proving the page
      // landed at the right rows and the right columns
      cy.getGridCellAt(2500, 0).should("have.text", "2501")
      cy.getGridCellAt(2500, 1).should("have.text", "25010")

      // And the last row of the final page is correct too
      cy.getGridViewport().scrollTo("bottom")
      cy.getGridCellAt(4999, 0).should("have.text", "5000")
      cy.getGridCellAt(4999, 1).should("have.text", "50000")
    })

    it("loads two adjacent pages correctly across a page boundary", () => {
      // Given a multi-page result
      cy.typeQuery("select x from long_sequence(5000)")
      cy.runLine()
      cy.wait(100)

      // When the viewport straddles the 2000/3000 page boundary, forcing both
      // pages to load together in a single fetch that is split between them
      cy.getGridViewport().scrollTo(0, 2999 * rowHeight)

      // Then the rows on each side of the boundary show their true values —
      // a mis-split would land the wrong page's data here
      cy.getGridCellAt(2999, 0).should("have.text", "3000")
      cy.getGridCellAt(3000, 0).should("have.text", "3001")
    })

    it("a slow page from a superseded query never lands in the new result", () => {
      // Given every page fetch past the seed is stalled, so a deep-page request
      // can still be in flight when a new query supersedes it on the shared grid
      cy.intercept("/exec*", (req) => {
        const lo = parseInt(String(req.query.limit).split(",")[0], 10)
        if (lo > 1000) {
          req.on("response", (res) => res.setDelay(2500))
        }
      })

      // And query A is run, then scrolled deep enough to dispatch a stalled page
      cy.typeQuery("select x a from long_sequence(5000)")
      cy.runLine()
      cy.wait(100)
      cy.getGridViewport().scrollTo(0, 2500 * rowHeight)
      cy.wait(300)

      // When query B supersedes A before A's page-2 response lands
      cy.clearEditor()
      cy.typeQuery("select x * 1000 a from long_sequence(5000)")
      cy.runLine()
      cy.wait(100)

      // Then B owns the grid: its seed row is B's value, and the same deep row
      // shows B's value, never A's stale page-2 value (which is 2501)
      cy.getGridCellAt(0, 0).should("have.text", "1000")
      cy.getGridViewport().scrollTo(0, 2500 * rowHeight)
      cy.getGridCellAt(2500, 0).should("have.text", "2501000", {
        timeout: 10000,
      })
    })

    it("updates the header names when a new query reuses the same column widths", () => {
      // Given a result whose single column clamps to some width
      cy.typeQuery("select x aa from long_sequence(20)")
      cy.runLine()
      cy.getColumnName(0).should("eq", "aa")

      // When a new query returns a column of the same width but a different name
      cy.clearEditor()
      cy.typeQuery("select x bb from long_sequence(20)")
      cy.runLine()

      // Then the header reflects the new column, not the previous one
      cy.getColumnName(0).should("eq", "bb")
      cy.getGridCellAt(0, 0).should("have.text", "1")
    })
  })

  describe("keyboard navigation", () => {
    it("arrow keys move the active cell", () => {
      // Given
      cy.typeQuery(threeColumnQuery)
      cy.runLine()

      // When
      cy.selectGridCell(0, 0)
      cy.gridKey({ key: "ArrowRight" })
      cy.gridKey({ key: "ArrowDown" })

      // Then
      cy.getActiveCell().should("have.id", "cell-1-1")
    })

    it("Home and End jump to the row's first and last column", () => {
      // Given
      cy.typeQuery(threeColumnQuery)
      cy.runLine()
      cy.selectGridCell(0, 1)

      // When / Then
      cy.gridKey({ key: "End" })
      cy.getActiveCell().should("have.id", "cell-0-2")

      cy.gridKey({ key: "Home" })
      cy.getActiveCell().should("have.id", "cell-0-0")
    })

    it("Ctrl+Home and Ctrl+End jump to the grid corners", () => {
      // Given
      cy.typeQuery("select x from long_sequence(50)")
      cy.runLine()
      cy.selectGridCell(0, 0)

      // When / Then
      cy.gridKey({ key: "End", ctrlKey: true })
      cy.getActiveCell().should("have.id", "cell-49-0")

      cy.gridKey({ key: "Home", ctrlKey: true })
      cy.getActiveCell().should("have.id", "cell-0-0")
    })

    it("PageDown and PageUp move by a viewport of rows", () => {
      // Given
      cy.typeQuery("select x from long_sequence(200)")
      cy.runLine()
      cy.selectGridCell(0, 0)

      // When
      cy.gridKey({ key: "PageDown" })

      // Then — moved well past a single row
      cy.getActiveCell().should("not.have.id", "cell-0-0")

      // When / Then — back to the top
      cy.gridKey({ key: "PageUp" })
      cy.getActiveCell().should("have.id", "cell-0-0")
    })
  })

  describe("copy", () => {
    it("Ctrl+C copies the focused cell and pulses it", () => {
      // Given
      cy.typeQuery("select x from long_sequence(10)")
      cy.runLine()
      cy.selectGridCell(0, 0)

      // When
      cy.realPress(["Control", "c"])

      // Then
      cy.getActiveCell().should("have.attr", "data-pulse", "true")
      readClipboard().should("eq", "1")
    })

    it("the header copy button copies the column name", () => {
      // Given
      cy.typeQuery("select x from long_sequence(10)")
      cy.runLine()

      // When
      cy.getGridHeaderCopy(0).click({ force: true })

      // Then
      readClipboard().should("eq", "x")
    })
  })

  describe("yield focus to editor", () => {
    it("F2 clears the selection and returns focus to the editor", () => {
      // Given
      cy.typeQuery("select x from long_sequence(10)")
      cy.runLine()
      cy.selectGridCell(0, 0)
      cy.getActiveCell().should("exist")

      // When
      cy.realPress("F2")

      // Then
      cy.getActiveCell().should("not.exist")
      cy.getEditor().find("textarea").should("be.focused")
    })
  })

  describe("move column to front", () => {
    it("the '/' shortcut moves the focused column to the front", () => {
      // Given
      cy.typeQuery(threeColumnQuery)
      cy.runLine()
      cy.selectGridCell(0, 2)

      // When
      cy.gridKey({ key: "/" })

      // Then
      cy.getColumnName(0).should("eq", "c")
    })

    it("the toolbar button moves the focused column to the front", () => {
      // Given
      cy.typeQuery(threeColumnQuery)
      cy.runLine()
      cy.selectGridCell(0, 2)

      // When
      cy.gridToolbar("move-front").click()

      // Then
      cy.getColumnName(0).should("eq", "c")
    })

    it("the toolbar button is disabled until a cell is selected", () => {
      // Given
      cy.typeQuery(threeColumnQuery)
      cy.runLine()

      // Then — nothing selected yet
      cy.gridToolbar("move-front").should("be.disabled")

      // When
      cy.selectGridCell(0, 0)

      // Then
      cy.gridToolbar("move-front").should("not.be.disabled")
    })

    it("keeps each value under its own header when a column is already frozen", () => {
      // Given a result with distinct per-column values and the left column (a) frozen
      cy.typeQuery(distinctColumnQuery)
      cy.runLine()
      cy.gridToolbar("freeze").click()
      cy.getGridCellAt(0, 0).should("have.attr", "data-frozen", "true")

      // When the user moves the third column (c) to the front
      cy.selectGridCell(0, 2)
      cy.gridToolbar("move-front").click()

      // Then the frozen column stays first and the moved column follows it
      cy.getColumnName(0).should("eq", "a")
      cy.getColumnName(1).should("eq", "c")
      cy.getColumnName(2).should("eq", "b")

      // And every cell still shows its own column's value, not a neighbour's
      cy.getGridCellAt(0, 0).should("have.text", "1")
      cy.getGridCellAt(0, 1).should("have.text", "100")
      cy.getGridCellAt(0, 2).should("have.text", "10")
    })
  })

  describe("freeze left", () => {
    it("the toolbar freezes and unfreezes the left column", () => {
      // Given
      cy.typeQuery(threeColumnQuery)
      cy.runLine()

      // When
      cy.gridToolbar("freeze").click()

      // Then
      cy.getGridCellAt(0, 0).should("have.attr", "data-frozen", "true")
      cy.gridToolbar("freeze").should("have.attr", "data-selected", "true")

      // When
      cy.gridToolbar("freeze").click()

      // Then
      cy.getFrozenCells().should("have.length", 0)
      cy.gridToolbar("freeze").should("have.attr", "data-selected", "false")
    })

    it("dragging the freeze handle freezes an additional column", () => {
      // Given
      cy.typeQuery("select x a, x b, x c, x d from long_sequence(20)")
      cy.runLine()
      cy.gridToolbar("freeze").click()
      cy.getGridCellAt(0, 1).should("not.have.attr", "data-frozen")

      // When
      cy.freezeColumnViaHandle(250)

      // Then
      cy.getGridCellAt(0, 1).should("have.attr", "data-frozen", "true")
    })

    it("dragging the handle from an unfrozen grid freezes multiple columns", () => {
      // Given a four-column result with no frozen columns
      cy.typeQuery("select x a, x b, x c, x d from long_sequence(20)")
      cy.runLine()
      cy.getGridCellAt(0, 0).should("be.visible")
      cy.getFrozenCells().should("have.length", 0)
      cy.get("[data-hook='grid-freeze-handle']").should("exist")

      // When dragging the handle past the first two columns
      cy.getGridCellAt(0, 1).then(($cell) => {
        cy.dragFreezeHandleTo($cell[0].getBoundingClientRect().right)
      })

      // Then the first two columns are frozen and the third is not
      cy.getGridCellAt(0, 0).should("have.attr", "data-frozen", "true")
      cy.getGridCellAt(0, 1).should("have.attr", "data-frozen", "true")
      cy.getGridCellAt(0, 2).should("not.have.attr", "data-frozen")

      // When dragging the handle further to include the third column
      cy.getGridCellAt(0, 2).then(($cell) => {
        cy.dragFreezeHandleTo($cell[0].getBoundingClientRect().right)
      })

      // Then the first three columns are frozen and the fourth is not
      cy.getGridCellAt(0, 2).should("have.attr", "data-frozen", "true")
      cy.getGridCellAt(0, 3).should("not.have.attr", "data-frozen")
    })

    it("keeps the frozen column pinned while scrolling horizontally", () => {
      // Given a result wide enough to scroll horizontally, left column frozen
      const columns = Array.from({ length: 100 }, (_, i) => `x c${i}`).join(
        ", ",
      )
      cy.typeQueryDirectly(`select ${columns} from long_sequence(10)`)
      cy.runLine()
      cy.gridToolbar("freeze").click()
      cy.getGridCellAt(0, 0).should("have.attr", "data-frozen", "true")

      let frozenLeft
      cy.getGridCellAt(0, 0).then(($cell) => {
        frozenLeft = $cell[0].getBoundingClientRect().left
      })

      // When scrolling all the way to the right
      cy.getGridViewport().scrollTo("right")

      // Then the grid scrolled, the frozen column stayed put, and the shadow showed
      cy.getGridViewport().should(($vp) => {
        expect($vp[0].scrollLeft).to.be.greaterThan(0)
      })
      cy.getGridCellAt(0, 0).should(($cell) => {
        expect($cell[0].getBoundingClientRect().left).to.be.closeTo(
          frozenLeft,
          2,
        )
      })
      cy.get("[data-hook='grid-frozen-shadow']").should("be.visible")
    })
  })

  describe("column resize", () => {
    it("dragging the separator widens the column", () => {
      // Given
      cy.typeQuery(threeColumnQuery)
      cy.runLine()
      let startWidth
      cy.getGridCellAt(0, 0).then(($cell) => {
        startWidth = $cell[0].getBoundingClientRect().width
      })

      // When
      cy.resizeColumn(0, 120)

      // Then
      cy.getGridCellAt(0, 0).should(($cell) => {
        expect($cell[0].getBoundingClientRect().width).to.be.greaterThan(
          startWidth,
        )
      })
    })

    it("arrow keys on the separator resize the column", () => {
      // Given
      cy.typeQuery(threeColumnQuery)
      cy.runLine()
      let startWidth
      cy.getGridCellAt(0, 0).then(($cell) => {
        startWidth = $cell[0].getBoundingClientRect().width
      })

      // When
      cy.get("[data-hook='grid-col-resizer']")
        .filter(":visible")
        .first()
        .focus()
      cy.realPress("ArrowRight")
      cy.realPress("ArrowRight")
      cy.realPress("ArrowRight")

      // Then
      cy.getGridCellAt(0, 0).should(($cell) => {
        expect($cell[0].getBoundingClientRect().width).to.be.greaterThan(
          startWidth,
        )
      })
    })
  })

  describe("reset layout", () => {
    it("the toolbar reset restores the default column width", () => {
      // Given
      cy.typeQuery(threeColumnQuery)
      cy.runLine()
      let defaultWidth
      cy.getGridCellAt(0, 0).then(($cell) => {
        defaultWidth = $cell[0].getBoundingClientRect().width
      })
      cy.resizeColumn(0, 150)

      // When
      cy.gridToolbar("reset").click()

      // Then
      cy.getGridCellAt(0, 0).should(($cell) => {
        expect($cell[0].getBoundingClientRect().width).to.be.closeTo(
          defaultWidth,
          2,
        )
      })
    })

    it("Ctrl+B resets the layout", () => {
      // Given
      cy.typeQuery(threeColumnQuery)
      cy.runLine()
      let defaultWidth
      cy.getGridCellAt(0, 0).then(($cell) => {
        defaultWidth = $cell[0].getBoundingClientRect().width
      })
      cy.resizeColumn(0, 150)

      // When
      cy.selectGridCell(0, 0)
      cy.gridKey({ key: "b", ctrlKey: true })

      // Then
      cy.getGridCellAt(0, 0).should(($cell) => {
        expect($cell[0].getBoundingClientRect().width).to.be.closeTo(
          defaultWidth,
          2,
        )
      })
    })
  })

  describe("layout persistence", () => {
    it("a resized column keeps its width after a re-run", () => {
      // Given
      cy.typeQuery(threeColumnQuery)
      cy.runLine()
      cy.resizeColumn(0, 150)
      let widenedWidth
      cy.getGridCellAt(0, 0).then(($cell) => {
        widenedWidth = $cell[0].getBoundingClientRect().width
      })

      // When
      cy.runLine()

      // Then
      cy.getGridCellAt(0, 0).should(($cell) => {
        expect($cell[0].getBoundingClientRect().width).to.be.closeTo(
          widenedWidth,
          2,
        )
      })
    })

    it("column order and freeze survive a re-run", () => {
      // Given
      cy.typeQuery(threeColumnQuery)
      cy.runLine()
      cy.selectGridCell(0, 2)
      cy.gridKey({ key: "/" })
      cy.getColumnName(0).should("eq", "c")
      cy.gridToolbar("freeze").click()

      // When
      cy.runLine()

      // Then
      cy.getColumnName(0).should("eq", "c")
      cy.getFrozenCells().should("have.length.greaterThan", 0)
      cy.gridToolbar("freeze").should("have.attr", "data-selected", "true")
    })

    it("reset clears the persisted layout for the next run", () => {
      // Given
      cy.typeQuery(threeColumnQuery)
      cy.runLine()
      let defaultWidth
      cy.getGridCellAt(0, 0).then(($cell) => {
        defaultWidth = $cell[0].getBoundingClientRect().width
      })
      cy.resizeColumn(0, 150)
      cy.gridToolbar("reset").click()

      // When
      cy.runLine()

      // Then
      cy.getColumnName(0).should("eq", "a")
      cy.getGridCellAt(0, 0).should(($cell) => {
        expect($cell[0].getBoundingClientRect().width).to.be.closeTo(
          defaultWidth,
          2,
        )
      })
    })
  })

  describe("designated timestamp", () => {
    const table = "grid_designated_ts"

    afterEach(() => {
      cy.execQuery(`drop table if exists ${table}`)
    })

    it("colors only the designated timestamp column, not every timestamp column", () => {
      // Given — ts is designated, ts2 is a plain timestamp column
      cy.execQuery(`drop table if exists ${table}`)
      cy.execQuery(
        `create table ${table} (ts timestamp, ts2 timestamp, val long) timestamp(ts)`,
      )
      cy.execQuery(
        `insert into ${table} values('2024-01-01T00:00:00.000000Z','2024-01-01T00:00:00.000000Z',1)`,
      )

      // When
      cy.typeQuery(`select * from ${table}`)
      cy.runLine()

      // Then
      cy.getGridCellAt(0, 0).should("have.attr", "data-timestamp", "true")
      cy.getGridCellAt(0, 1).should("not.have.attr", "data-timestamp")
    })
  })

  describe("cell formatting", () => {
    it("renders null values as the literal 'null'", () => {
      // Given / When
      cy.typeQuery("select cast(null as long) n from long_sequence(1)")
      cy.runLine()

      // Then
      cy.getGridCellAt(0, 0).should("have.text", "null")
    })
  })

  describe("toolbar actions", () => {
    it("copies the current page as a Markdown table", () => {
      // Given
      cy.typeQuery("select x from long_sequence(5)")
      cy.runLine()

      // When
      cy.gridToolbar("markdown").click()

      // Then
      readClipboard().should("contain", "| x")
    })

    it("refresh re-runs the query and keeps the rows", () => {
      // Given
      cy.typeQuery("select x from long_sequence(5)")
      cy.runLine()
      cy.intercept("/exec*").as("refresh")

      // When
      cy.gridToolbar("refresh").click()

      // Then
      cy.wait("@refresh")
      cy.getGridRows().should("have.length.greaterThan", 0)
    })
  })

  describe("column width allocation", () => {
    beforeEach(() => {
      cy.getEditorContent().should("be.visible")
      cy.clearEditor()
    })

    const longArray = (n) =>
      `ARRAY[${Array.from({ length: n }, (_, i) => `${i + 1}.0`).join(",")}]`

    const gridArea = () => cy.get('[data-hook="result-grid-tanstack"]:visible')

    const cellIn = (col) => gridArea().find(`#cell-0-${col}`)

    const runQuery = (query) => {
      cy.typeQueryDirectly(query)
      cy.clickRunQuery()
      cellIn(0).should("be.visible")
    }

    it("S1: a single wide column fills the grid width", () => {
      // Given a result with one very long column
      runQuery("select string_agg(x::string, ',') s from long_sequence(500)")

      // Then it stretches to the full grid width
      let gridWidth
      gridArea().then(($grid) => {
        gridWidth = $grid[0].getBoundingClientRect().width
      })
      cellIn(0).then(($cell) => {
        expect($cell[0].getBoundingClientRect().width).to.be.closeTo(
          gridWidth,
          20,
        )
      })
    })

    it("S2: two wide columns split the grid width evenly and the array is truncated", () => {
      // Given a result with two very wide columns
      runQuery(
        `select string_agg(x::string, ',') s, ${longArray(300)} arr from long_sequence(500)`,
      )

      // Then each column takes half of the grid width
      let gridWidth
      gridArea().then(($grid) => {
        gridWidth = $grid[0].getBoundingClientRect().width
      })
      let firstWidth
      cellIn(0).then(($cell) => {
        firstWidth = $cell[0].getBoundingClientRect().width
      })
      cellIn(1).then(($cell) => {
        const secondWidth = $cell[0].getBoundingClientRect().width
        expect(firstWidth).to.be.closeTo(secondWidth, 8)
        expect(firstWidth).to.be.closeTo(gridWidth / 2, 20)
      })

      // And the clipped array ends with an ellipsis before its closing bracket
      cellIn(1)
        .invoke("text")
        .then((text) => {
          expect(text.trim()).to.match(/\.\.\.]$/)
        })
    })

    it("S3: narrow columns keep their width and the array takes the remaining space", () => {
      // Given a few narrow columns and one wide array column
      runQuery(`select 1, 2, 3, ${longArray(300)} arr`)

      let gridWidth
      gridArea().then(($grid) => {
        gridWidth = $grid[0].getBoundingClientRect().width
      })

      // Then the narrow columns settle at one small, shared width
      let firstDigitWidth
      let digitsTotal = 0
      for (let col = 0; col < 3; col++) {
        cellIn(col).then(($cell) => {
          const width = $cell[0].getBoundingClientRect().width
          if (col === 0) firstDigitWidth = width
          else expect(width).to.be.closeTo(firstDigitWidth, 8)
          digitsTotal += width
        })
      }

      // And the array column takes exactly what the narrow columns leave behind
      cellIn(3).then(($cell) => {
        expect($cell[0].getBoundingClientRect().width).to.be.closeTo(
          gridWidth - digitsTotal,
          20,
        )
      })
    })

    it("S4: the array column stops at the 400px cap when space is tight", () => {
      const digits = Array.from({ length: 100 }, (_, i) => i + 1).join(",")

      // Given more narrow columns than the width can hold, plus a wide array
      runQuery(`select ${digits}, ${longArray(300)} arr`)

      // When the far-right array column is scrolled into view
      gridArea().find('[data-hook="grid-viewport"]').scrollTo("right")

      // Then it settles at the maximum column width
      cellIn(100)
        .should("be.visible")
        .then(($cell) => {
          expect($cell[0].getBoundingClientRect().width).to.be.closeTo(400, 3)
        })
    })
  })
})
