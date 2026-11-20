// @vitest-environment jsdom
import React from "react"
import { screen } from "@testing-library/react"
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

vi.mock("../NotebookProvider", () => ({
  useNotebookActions: () => ({}),
  useNotebookState: () => ({ settings: {} }),
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
  it("highlights a price change on the correct stable row after server rows reorder", () => {
    const store = createResultTrendStore()
    const viewportStore = createResultGridViewportStore()
    const panel = (data: DqlQueryResult) => (
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
          gridMode="stable"
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
  })

  it("keeps a single sample visible and draws a line when there are two samples", () => {
    renderComponent(
      <ResultGrid
        dataSource={inMemoryDataSource(
          [{ name: "history", type: "ARRAY", dim: 1, elemType: "DOUBLE" }],
          // The wire supports QuestDB ARRAYs beyond the scalar CellValue type.
          [[[7] as unknown as CellValue], [[8, 9] as unknown as CellValue]],
          -1,
        )}
        maxColumnWidth={"auto"}
        columnFormats={{ history: { visual: "sparkline" } }}
      />,
    )

    const [single, multiple] = screen.getAllByRole("gridcell")
    expect(single).toHaveTextContent("7")
    expect(single.querySelector("polyline")).toBeNull()
    expect(multiple.querySelector("polyline")).not.toBeNull()
  })
})
