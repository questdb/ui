// @vitest-environment jsdom
import React from "react"
import { fireEvent, screen } from "@testing-library/react"
import { ThemeProvider } from "styled-components"
import { lightTheme } from "../../../../theme"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { renderComponent } from "../../../../test/component"
import type { CellValue } from "../../../../components/ResultGrid/types"
import type { DqlQueryResult } from "../../../../store/notebook"
import {
  ResultGrid,
  inMemoryDataSource,
} from "../../../../components/ResultGrid"
import type { HighlightConfig } from "../../../../components/ResultGrid/highlight"
import { ResultGridPanel } from "./ResultGridPanel"
import { ResultTrendProvider } from "./ResultTrendContext"
import { createResultTrendStore } from "./resultTrendStore"
import { createResultGridViewportStore } from "./resultGridViewportStore"

const notebook = vi.hoisted(() => ({
  actions: {} as Record<string, unknown>,
  state: { settings: {} } as { settings: Record<string, unknown> },
}))
vi.mock("../NotebookProvider", () => ({
  useNotebookActions: () => notebook.actions,
  useNotebookSettings: () => notebook.state.settings,
}))

vi.hoisted(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value: () => null,
  })
})

beforeEach(() => {
  // Supply a nonzero viewport so the real virtualizer mounts this tiny frame.
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(800)
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(600)
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, 800, 600),
  )
})

const columns = [
  { name: "symbol", type: "SYMBOL" },
  { name: "price", type: "DOUBLE" },
]
const frame = (dataset: DqlQueryResult["dataset"]): DqlQueryResult => ({
  type: "dql",
  query: "select symbol, price from trades order by price",
  columns,
  dataset,
  count: dataset.length,
})

const highlightConfig: HighlightConfig = {
  identityColumns: ["symbol"],
  rules: [
    {
      id: "up",
      kind: "previous",
      target: { kind: "column", name: "price" },
      appliesTo: "cell",
      condition: { op: "gt" },
      enabled: true,
      display: "always",
      color: "dataPositive",
    },
  ],
}

describe("dashboard grid", () => {
  it("does not use a sibling's numeric format for a text identifier", () => {
    const grid = (type: string, value: CellValue) => (
      <ResultGrid
        dataSource={inMemoryDataSource([{ name: "code", type }], [[value]], -1)}
        maxColumnWidth="auto"
        columnFormats={{ code: { kind: "percent", decimals: 2 } }}
      />
    )
    const { rerender } = renderComponent(grid("DOUBLE", 0.25))
    expect(screen.getByText("25.00%")).toBeVisible()
    rerender(grid("VARCHAR", "0012"))
    expect(screen.getByText("0012")).toBeVisible()
  })

  it("uses the readable light-theme text tone for positive thresholds", () => {
    renderComponent(
      <ThemeProvider theme={lightTheme}>
        <ResultGrid
          dataSource={inMemoryDataSource(columns, [["desk", 17]], -1)}
          maxColumnWidth="auto"
          columnFormats={{
            price: { thresholds: [{ value: 0, tone: "positive" }] },
          }}
        />
      </ThemeProvider>,
    )
    const expected = document.createElement("span")
    expected.style.color = lightTheme.color.dataPositive
    expect(getComputedStyle(screen.getByText(/^17(?:\.0+)?$/)).color).toBe(
      expected.style.color,
    )
  })

  it("highlights a price change on the correct stable row after server rows reorder", () => {
    const store = createResultTrendStore()
    const viewportStore = createResultGridViewportStore()
    const panel = (
      data: DqlQueryResult,
      gridMode: "stable" | "stream" = "stable",
    ) => (
      <ResultTrendProvider value={store}>
        <ResultGridPanel
          data={data}
          statementKey="prices"
          runToken={1}
          cellId="trades"
          bufferId={1}
          isFocused
          isRunning={false}
          onReRun={vi.fn()}
          onYieldFocus={vi.fn()}
          cellColumns={columns}
          viewportStore={viewportStore}
          highlightConfig={highlightConfig}
          refreshIntervalMs={undefined}
          gridMode={gridMode}
        />
      </ResultTrendProvider>
    )
    const first = frame([
      ["BTC", 1],
      ["ETH", 2],
    ])
    store.capture("trades", "prices", first, ["symbol"], {
      at: 0,
      restored: false,
    })
    const { rerender } = renderComponent(panel(first))

    const next = frame([
      ["ETH", 2],
      ["BTC", 10],
    ])
    store.capture("trades", "prices", next, ["symbol"], {
      at: 1,
      restored: false,
    })
    rerender(panel(next))

    expect(
      screen.getAllByRole("gridcell").map((cell) => cell.textContent),
    ).toEqual(["BTC", "10.0▲", "ETH", "2.0"])
    expect(
      screen.getByText("10.0").closest('[role="gridcell"]'),
    ).toHaveAttribute("data-highlight-color", "dataPositive")
    expect(
      screen.getByText("2.0").closest('[role="gridcell"]'),
    ).not.toHaveAttribute("data-highlight-color")

    rerender(panel(next, "stream"))
    expect(
      screen.getAllByRole("gridcell").map((cell) => cell.textContent),
    ).toEqual(["ETH", "2.0", "BTC", "10.0▲"])
  })

  it.each(["stable", "stream"] as const)(
    "does not replay a %s grid's last flash when its released result is read back",
    (gridMode) => {
      vi.useFakeTimers({ toFake: ["Date"] })
      vi.stubGlobal("matchMedia", () => ({
        matches: false,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }))
      try {
        const store = createResultTrendStore()
        const flashConfig: HighlightConfig = {
          identityColumns: ["symbol"],
          rules: [
            {
              id: "changed",
              kind: "previous",
              target: { kind: "column", name: "price" },
              appliesTo: "cell",
              condition: { op: "changed" },
              enabled: true,
              display: "temporary",
              color: "dataPositive",
            },
          ],
        }
        const panel = (data: DqlQueryResult) => (
          <ResultTrendProvider value={store}>
            <ResultGridPanel
              data={data}
              statementKey="prices"
              runToken={1}
              cellId="trades"
              bufferId={1}
              isFocused={false}
              isRunning={false}
              onReRun={vi.fn()}
              onYieldFocus={vi.fn()}
              cellColumns={columns}
              viewportStore={createResultGridViewportStore()}
              highlightConfig={flashConfig}
              refreshIntervalMs={undefined}
              gridMode={gridMode}
            />
          </ResultTrendProvider>
        )
        const priceCell = () =>
          screen.getByText("10.0").closest('[role="gridcell"]') as HTMLElement

        // Given a refresh that changed BTC's price and flashed it
        vi.setSystemTime(1_000_000)
        const first = frame([
          ["BTC", 1],
          ["ETH", 2],
        ])
        store.capture("trades", "prices", first, ["symbol"], {
          at: 1_000_000,
          restored: false,
        })
        const live = renderComponent(panel(first))
        vi.setSystemTime(1_005_000)
        const next = frame([
          ["BTC", 10],
          ["ETH", 2],
        ])
        store.capture("trades", "prices", next, ["symbol"], {
          at: 1_005_000,
          restored: false,
        })
        live.rerender(panel(next))
        expect(priceCell().style.animationDelay).toBe("0ms")

        // When the offscreen result is released and read back a minute later
        live.unmount()
        store.releaseCell("trades")
        vi.setSystemTime(1_065_000)
        const readBack = structuredClone(next)
        store.capture("trades", "prices", readBack, ["symbol"], {
          at: 1_005_000,
          restored: true,
        })
        renderComponent(panel(readBack))

        // Then the flash stays timed from the refresh that changed the price
        expect(priceCell()).toHaveAttribute("data-highlight", "temporary")
        expect(priceCell().style.animationDelay).toBe("-60000ms")
      } finally {
        vi.useRealTimers()
        vi.unstubAllGlobals()
      }
    },
  )

  it("sets and shows a clicked LONG id as a number", () => {
    // Given a grid whose click sets the id of the row, a LONG sent as text
    const setVariableValues = vi.fn()
    notebook.actions = { setVariableValues }
    const ids = [
      { name: "id", type: "LONG" },
      { name: "desk", type: "SYMBOL" },
    ]
    const panel = () => (
      <ResultTrendProvider value={createResultTrendStore()}>
        <ResultGridPanel
          data={{
            type: "dql",
            query: "select id, desk from desks",
            columns: ids,
            dataset: [
              ["41", "east"],
              ["42", "west"],
            ],
            count: 2,
          }}
          statementKey="desks"
          runToken={1}
          cellId="desks"
          bufferId={1}
          isFocused={false}
          isRunning={false}
          onReRun={vi.fn()}
          onYieldFocus={vi.fn()}
          cellColumns={ids}
          viewportStore={createResultGridViewportStore()}
          highlightConfig={{ identityColumns: [], rules: [] }}
          interactions={{ click: { variable: "sel", column: "id" } }}
          refreshIntervalMs={undefined}
        />
      </ResultTrendProvider>
    )
    try {
      const { rerender } = renderComponent(panel())

      // When the user clicks the second row
      fireEvent.click(screen.getByText("west"))

      // Then the variable holds the number, and that row shows as selected
      expect(setVariableValues).toHaveBeenCalledWith({ sel: "42" })
      notebook.state = {
        settings: { variables: [{ name: "sel", value: "42" }] },
      }
      rerender(panel())
      expect(
        screen.getByText("west").closest('[role="gridcell"]'),
      ).toHaveAttribute("data-highlight")
      expect(
        screen.getByText("east").closest('[role="gridcell"]'),
      ).not.toHaveAttribute("data-highlight")
    } finally {
      notebook.actions = {}
      notebook.state = { settings: {} }
    }
  })

  it.each(["Enter", " "])(
    "activates the focused row with %s when clicks are bound",
    (key) => {
      // Given a grid with a row activation handler
      const activate = vi.fn()
      renderComponent(
        <ResultGrid
          dataSource={inMemoryDataSource(
            columns,
            [
              ["BTC", 1],
              ["ETH", 2],
            ],
            -1,
          )}
          maxColumnWidth="auto"
          onCellActivate={activate}
        />,
      )
      const grid = screen.getByRole("grid")
      grid.focus()

      // When keyboard navigation enters the first cell and activates it
      fireEvent.keyDown(grid, { key: "ArrowDown" })
      fireEvent.keyDown(grid, { key })

      // Then it uses the same row and column as a click
      expect(activate).toHaveBeenCalledOnce()
      expect(activate).toHaveBeenCalledWith(["BTC", 1], 0)
    },
  )

  it("points each grid's active descendant to its own mounted cell", () => {
    const activate = vi.fn()
    renderComponent(
      <>
        <ResultGrid
          dataSource={inMemoryDataSource(columns, [["east", 1]], -1)}
          maxColumnWidth="auto"
          onCellActivate={vi.fn()}
        />
        <ResultGrid
          dataSource={inMemoryDataSource(columns, [["west", 2]], -1)}
          maxColumnWidth="auto"
          onCellActivate={activate}
        />
      </>,
    )
    const grid = screen.getAllByRole("grid")[1]
    grid.focus()
    fireEvent.keyDown(grid, { key: "ArrowDown" })
    const activeId = grid.getAttribute("aria-activedescendant")
    const active = activeId ? document.getElementById(activeId) : null
    expect(active).toHaveTextContent("west")
    expect(grid).toContainElement(active)
    fireEvent.keyDown(grid, { key: "Enter" })
    expect(activate).toHaveBeenCalledWith(["west", 2], 0)
  })

  it("preserves the digits of a formatted LONG value from the database", () => {
    renderComponent(
      <ResultGrid
        dataSource={inMemoryDataSource(
          [{ name: "volume", type: "LONG" }],
          [["9007199254740993"]],
          -1,
        )}
        maxColumnWidth="auto"
        columnFormats={{ volume: { kind: "number" } }}
      />,
    )

    expect(screen.getByRole("gridcell")).toHaveTextContent(
      "9,007,199,254,740,993",
    )
  })

  it("keeps a single sample visible and draws a line when there are two samples", () => {
    renderComponent(
      <ResultGrid
        dataSource={inMemoryDataSource(
          [{ name: "history", type: "ARRAY", dim: 1, elemType: "DOUBLE" }],
          // The wire supports QuestDB ARRAYs beyond the scalar CellValue type.
          [
            [[7] as unknown as CellValue],
            [[8, 9] as unknown as CellValue],
            [[-1e308, 1e308] as unknown as CellValue],
          ],
          -1,
        )}
        maxColumnWidth="auto"
        columnFormats={{ history: { visual: "sparkline" } }}
      />,
    )

    const [single, multiple, extreme] = screen.getAllByRole("gridcell")
    expect(single).toHaveTextContent("7")
    expect(single.querySelector("polyline")).toBeNull()
    expect(multiple.querySelector("polyline")).not.toBeNull()
    expect(multiple).toHaveAccessibleName(/8.*9/)
    expect(extreme.querySelector("polyline")).toBeNull()
    expect(extreme).toHaveTextContent(/1e\+308/)
  })
})
