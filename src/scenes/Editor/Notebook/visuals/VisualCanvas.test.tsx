// @vitest-environment jsdom
import React from "react"
import { fireEvent, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { renderComponent } from "../../../../test/component"
import { clearRenderReport, getRenderReport } from "../renderReports"
import { VisualCanvas } from "./VisualCanvas"
import { ThemeProvider } from "styled-components"
import { lightTheme } from "../../../../theme"

vi.mock("../customChart/maps", () => ({
  MAP_NAMES: ["world"],
  isMapLoaded: () => false,
  ensureMaps: () => Promise.reject(new Error("map unavailable")),
}))

const bufferId = 11
const cellId = "dashboard-stat"

afterEach(() => clearRenderReport(bufferId, cellId))

describe("VisualCanvas", () => {
  const defaults = {
    bufferId,
    cellId,
    formats: {},
    interactions: undefined,
    setVariables: () => undefined,
    live: false,
    isFocused: true,
  }

  it("uses the readable positive text color for the Light uptime summary and lane", () => {
    renderComponent(
      <ThemeProvider theme={lightTheme}>
        <VisualCanvas
          {...defaults}
          visual={{ type: "uptime" }}
          statements={[
            {
              columns: [
                { name: "ts", type: "TIMESTAMP" },
                { name: "lane", type: "SYMBOL" },
                { name: "state", type: "SYMBOL" },
              ],
              rows: [
                ["2026-01-01T00:00:00Z", "db", "up"],
                ["2026-01-01T00:01:00Z", "db", "up"],
              ],
            },
          ]}
        />
      </ThemeProvider>,
    )
    const expected = document.createElement("span")
    expected.style.color = lightTheme.color.dataPositive
    for (const label of ["All operational", "Up"]) {
      expect(getComputedStyle(screen.getByText(label)).color).toBe(
        expected.style.color,
      )
    }
  })

  it("distinguishes Neutral uptime buckets from Good ones without counting downtime", () => {
    const { container } = renderComponent(
      <ThemeProvider theme={lightTheme}>
        <VisualCanvas
          {...defaults}
          visual={{
            type: "uptime",
            columns: { end: "end_time" },
            buckets: 10,
            severity: { up: "good", maintenance: "neutral" },
          }}
          statements={[
            {
              columns: [
                { name: "ts", type: "TIMESTAMP" },
                { name: "lane", type: "SYMBOL" },
                { name: "state", type: "SYMBOL" },
                { name: "end_time", type: "TIMESTAMP" },
              ],
              rows: [
                ["2026-01-01T00:00:00Z", "api", "up", "2026-01-01T05:00:00Z"],
                [
                  "2026-01-01T05:00:00Z",
                  "api",
                  "maintenance",
                  "2026-01-01T10:00:00Z",
                ],
              ],
            },
          ]}
        />
      </ThemeProvider>,
    )
    const bars = container.querySelectorAll(
      '[data-hook="uptime-bars"] [data-lane-index="0"] i',
    )
    expect(bars).toHaveLength(10)
    expect(getComputedStyle(bars[0]).backgroundColor).not.toBe(
      getComputedStyle(bars[9]).backgroundColor,
    )
    expect(screen.getByText("100 % uptime")).toBeVisible()
    expect(screen.getByText("1 neutral")).toBeVisible()
    expect(screen.queryByText("All operational")).not.toBeInTheDocument()
  })

  it("drops all removed Stat tiles even when their labels repeat", () => {
    const view = (rows: (string | number)[][]) => (
      <VisualCanvas
        {...defaults}
        visual={{ type: "stat" }}
        statements={[
          {
            columns: [
              { name: "desk", type: "SYMBOL" },
              { name: "reading", type: "DOUBLE" },
            ],
            rows,
          },
        ]}
      />
    )
    const { rerender } = renderComponent(
      view([
        ["London", 101],
        ["London", 202],
        ["Paris", 303],
      ]),
    )
    expect(screen.getAllByText("London")).toHaveLength(2)
    rerender(view([["Paris", 303]]))
    expect(screen.queryByText("London")).not.toBeInTheDocument()
    expect(screen.getByText("Paris")).toBeVisible()
  })

  it("uses a text tone for the Light Bullet badge", () => {
    renderComponent(
      <ThemeProvider theme={lightTheme}>
        <VisualCanvas
          {...defaults}
          visual={{ type: "bullet" }}
          formats={{
            reading: { thresholds: [{ value: 0, tone: "positive" }] },
          }}
          statements={[
            {
              columns: [
                { name: "desk", type: "SYMBOL" },
                { name: "reading", type: "DOUBLE" },
              ],
              rows: [["East", 4]],
            },
          ]}
        />
      </ThemeProvider>,
    )
    const expected = document.createElement("span")
    expected.style.color = lightTheme.color.dataPositive
    expect(getComputedStyle(screen.getByText("OK")).color).toBe(
      expected.style.color,
    )
  })

  it("keeps Bullet hover cards out of the layout until a row is hovered", () => {
    const { container } = renderComponent(
      <VisualCanvas
        {...defaults}
        visual={{ type: "bullet" }}
        statements={[
          {
            columns: [
              { name: "desk", type: "SYMBOL" },
              { name: "reading", type: "DOUBLE" },
            ],
            rows: [
              ["East", 4],
              ["West", 6],
            ],
          },
        ]}
      />,
    )
    const cards = container.querySelectorAll("[data-card]")
    expect(cards).toHaveLength(2)
    for (const card of Array.from(cards))
      expect(getComputedStyle(card).display).toBe("none")
  })

  it("gives screen readers a Bullet row's headroom and threshold boundaries", () => {
    // Given bullets with a limit column and a thresholded value format
    renderComponent(
      <VisualCanvas
        {...defaults}
        visual={{ type: "bullet" }}
        formats={{
          used: {
            thresholds: [
              { value: 0, tone: "positive" },
              { value: 70, tone: "warning" },
              { value: 90, tone: "negative" },
            ],
          },
        }}
        statements={[
          {
            columns: [
              { name: "desk", type: "SYMBOL" },
              { name: "used", type: "DOUBLE" },
              { name: "limit", type: "DOUBLE" },
            ],
            rows: [["East", 75, 100]],
          },
        ]}
      />,
    )

    // Then the figures the hover card shows are in the accessibility tree once
    expect(screen.getAllByRole("term").map((term) => term.textContent)).toEqual(
      ["used", "Limit", "Used", "Headroom", "Near limit from", "Breach from"],
    )
    const headroom = screen
      .getAllByRole("term")
      .find((term) => term.textContent === "Headroom")
    expect(headroom?.nextElementSibling).toHaveTextContent("25")
  })

  it("opens a lower Bullet row's hover card upwards, inside the list", () => {
    const { container } = renderComponent(
      <VisualCanvas
        {...defaults}
        visual={{ type: "bullet" }}
        statements={[
          {
            columns: [
              { name: "desk", type: "SYMBOL" },
              { name: "reading", type: "DOUBLE" },
            ],
            rows: [
              ["East", 4],
              ["West", 6],
            ],
          },
        ]}
      />,
    )
    const list = container.querySelector<HTMLElement>('[data-hook="bullets"]')
    const [first, last] = Array.from(
      container.querySelectorAll<HTMLElement>("[data-index]"),
    )
    if (!list || !first || !last) throw new Error("bullets not rendered")
    vi.spyOn(list, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 0, 300, 200),
    )
    vi.spyOn(first, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 10, 300, 50),
    )
    vi.spyOn(last, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 140, 300, 50),
    )

    // When the pointer enters the top row, then the bottom row
    fireEvent.mouseEnter(first)
    fireEvent.mouseEnter(last)

    // Then the top row's card opens below it and the bottom row's above it
    expect(first).not.toHaveAttribute("data-card-above")
    expect(last).toHaveAttribute("data-card-above")
    const card = last.querySelector("[data-card]")
    expect(card && getComputedStyle(card).top).toBe("auto")
  })

  it("mounts only nearby Bullet bars but still reports all rows", () => {
    const width = vi
      .spyOn(HTMLElement.prototype, "offsetWidth", "get")
      .mockReturnValue(600)
    const height = vi
      .spyOn(HTMLElement.prototype, "offsetHeight", "get")
      .mockReturnValue(180)
    try {
      const view = renderComponent(
        <VisualCanvas
          {...defaults}
          visual={{ type: "bullet" }}
          statements={[
            {
              columns: [
                { name: "device", type: "SYMBOL" },
                { name: "reading", type: "DOUBLE" },
              ],
              rows: Array.from({ length: 1000 }, (_, i) => [`device ${i}`, i]),
            },
          ]}
        />,
      )
      expect(screen.getByText("device 0")).toBeInTheDocument()
      expect(screen.queryByText("device 999")).not.toBeInTheDocument()
      expect(
        view.container.querySelectorAll("[data-index]").length,
      ).toBeLessThan(20)
      expect(getRenderReport(bufferId, cellId)).toMatchObject({
        drawn: { type: "bullet", bars: 1000 },
      })
    } finally {
      width.mockRestore()
      height.mockRestore()
    }
  })

  it("shows and reports how many stat tiles were omitted", () => {
    renderComponent(
      <VisualCanvas
        {...defaults}
        visual={{ type: "stat" }}
        statements={[
          {
            columns: [
              { name: "service", type: "SYMBOL" },
              { name: "reading", type: "INT" },
            ],
            rows: Array.from({ length: 25 }, (_, i) => [`service ${i}`, i]),
          },
        ]}
      />,
    )
    expect(screen.getByRole("status")).toHaveTextContent(
      "Showing 24 of 25 tiles.",
    )
    expect(getRenderReport(bufferId, cellId)?.problems).toContainEqual({
      message: "Showing 24 of 25 tiles.",
      severity: "warning",
    })
  })

  it.each(["treemap", "sunburst"] as const)(
    "rejects partial results rather than showing incomplete %s totals",
    (type) => {
      // Given a settled query whose result was capped by the server
      renderComponent(
        <VisualCanvas
          {...defaults}
          visual={{ type }}
          statements={[
            {
              columns: [
                { name: "station", type: "SYMBOL" },
                { name: "volume", type: "INT" },
              ],
              rows: [["east", 10]],
              partial: true,
            },
          ]}
        />,
      )

      // Then the pane and report explain why no aggregate was drawn
      expect(screen.getByText(/returned only part of its rows/)).toBeVisible()
      expect(getRenderReport(bufferId, cellId)?.problems[0]?.severity).toBe(
        "error",
      )
    },
  )

  it("does not draw a Sankey from an incomplete result", () => {
    // Given an otherwise valid flow in a capped statement result
    renderComponent(
      <VisualCanvas
        {...defaults}
        visual={{ type: "sankey" }}
        statements={[
          {
            columns: [
              { name: "source", type: "SYMBOL" },
              { name: "target", type: "SYMBOL" },
              { name: "amount", type: "INT" },
            ],
            rows: [["east", "west", 10]],
            partial: true,
          },
        ]}
      />,
    )
    expect(screen.getByText(/Aggregate flows in SQL/)).toBeVisible()
    expect(getRenderReport(bufferId, cellId)?.problems[0]?.severity).toBe(
      "error",
    )
  })

  it("starts observing a lane strip when an empty Uptime result becomes populated", () => {
    const observe = vi.fn()
    const disconnect = vi.fn()
    const Original = globalThis.ResizeObserver
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe = observe
        unobserve = vi.fn()
        disconnect = disconnect
      },
    )
    const view = (populated: boolean) => (
      <VisualCanvas
        {...defaults}
        visual={{ type: "uptime" }}
        statements={[
          {
            columns: [
              { name: "ts", type: "TIMESTAMP" },
              { name: "lane", type: "SYMBOL" },
              { name: "state", type: "SYMBOL" },
            ],
            rows: populated
              ? [
                  ["2026-01-01T00:00:00Z", "db", "up"],
                  ["2026-01-01T00:01:00Z", "db", "up"],
                ]
              : [],
          },
        ]}
      />
    )
    try {
      const { container, rerender, unmount } = renderComponent(view(false))
      expect(container.querySelector('[data-hook="uptime-bars"]')).toBeNull()
      rerender(view(true))
      const root = container.querySelector('[data-hook="uptime-bars"]')
      expect(root).not.toBeNull()
      expect(observe).toHaveBeenCalledWith(root)
      unmount()
      expect(disconnect).toHaveBeenCalled()
    } finally {
      globalThis.ResizeObserver = Original
    }
  })

  it("windows large Uptime panels instead of mounting every lane", () => {
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(330)
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(800)
    const { container } = renderComponent(
      <VisualCanvas
        {...defaults}
        visual={{ type: "uptime" }}
        statements={[
          {
            columns: [
              { name: "ts", type: "TIMESTAMP" },
              { name: "service", type: "SYMBOL" },
              { name: "state", type: "SYMBOL" },
            ],
            rows: Array.from({ length: 400 }, (_, i) => [
              ["2026-01-01T00:00:00Z", `host ${i}`, "up"],
              ["2026-01-01T00:01:00Z", `host ${i}`, "down"],
            ]).flat(),
          },
        ]}
      />,
    )
    const lanes = container.querySelectorAll("[data-lane-index]")
    expect(lanes.length).toBeGreaterThan(0)
    expect(lanes.length).toBeLessThan(50)
  })

  it("explains a successful empty Bullet result", () => {
    renderComponent(
      <VisualCanvas
        {...defaults}
        visual={{ type: "bullet" }}
        statements={[{ columns: [{ name: "reading", type: "INT" }], rows: [] }]}
      />,
    )
    expect(screen.getByText("The query returned no rows.")).toBeVisible()
  })

  it("explains an empty successful Stat result", () => {
    renderComponent(
      <VisualCanvas
        {...defaults}
        visual={{ type: "stat" }}
        statements={[
          { columns: [{ name: "reading", type: "DOUBLE" }], rows: [] },
        ]}
      />,
    )
    expect(screen.getByText("The query returned no rows.")).toBeVisible()
    expect(getRenderReport(bufferId, cellId)?.problems[0]?.message).toBe(
      "The query returned no rows.",
    )
  })

  it.each(["stat", "liquidityHeatmap"] as const)(
    "reports a failed first statement of a %s visual as a failure, not as no rows",
    (type) => {
      renderComponent(
        <VisualCanvas
          {...defaults}
          visual={{ type }}
          statements={[
            null,
            {
              columns: [
                { name: "ts", type: "TIMESTAMP" },
                { name: "price", type: "DOUBLE" },
              ],
              rows: [["2026-01-01T00:00:00Z", 1]],
            },
          ]}
          statementErrors={["table does not exist", null]}
        />,
      )
      const message = "Query failed: table does not exist"
      expect(screen.getByRole("alert")).toHaveTextContent(message)
      expect(screen.queryByText("The query returned no rows.")).toBeNull()
      expect(getRenderReport(bufferId, cellId)?.problems).toEqual([
        { message, severity: "error" },
      ])
    },
  )

  it("reports a rejected map download instead of continuing to load", async () => {
    renderComponent(
      <VisualCanvas {...defaults} visual={{ type: "map" }} statements={[]} />,
    )
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not load the world map",
    )
    expect(screen.queryByText("Loading map…")).not.toBeInTheDocument()
  })

  it("keeps bids visible but distinguishes a failed ask query from an empty ask result", () => {
    const columns = [
      { name: "price", type: "DOUBLE" },
      { name: "size", type: "DOUBLE" },
    ]
    const bids = { columns, rows: [[99, 10]] }
    const { rerender } = renderComponent(
      <VisualCanvas
        {...defaults}
        visual={{ type: "orderBook" }}
        statements={[null, bids]}
        statementErrors={["Query cancelled", null]}
      />,
    )
    expect(screen.getByRole("alert")).toHaveTextContent("Ask query failed")
    expect(screen.getByText("99")).toBeVisible()
    expect(getRenderReport(bufferId, cellId)?.problems[0]?.message).toContain(
      "Ask query failed",
    )
    rerender(
      <VisualCanvas
        {...defaults}
        visual={{ type: "orderBook" }}
        statements={[{ columns, rows: [] }, bids]}
      />,
    )
    expect(screen.getByText("No asks")).toBeVisible()
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })

  it("keeps an explicit missing Order book total distinct from size and zero", () => {
    const columns = ["price", "size", "total"].map((name) => ({
      name,
      type: "LONG",
    }))
    const { container } = renderComponent(
      <VisualCanvas
        {...defaults}
        visual={{ type: "orderBook" }}
        formats={{ total: { kind: "number", decimals: 0 } }}
        statements={[
          {
            columns,
            rows: [
              [101, 7, "9007199254740993"],
              [102, 11, null],
            ],
          },
          { columns, rows: [[99, 5, 0]] },
        ]}
      />,
    )
    const rows = Array.from(
      container.querySelectorAll(
        '[data-hook="order-book-ask"], [data-hook="order-book-bid"]',
      ),
    )
    const values = Object.fromEntries(
      rows.map((row) => {
        const cells = Array.from(
          row.querySelectorAll("span"),
          (cell) => cell.textContent,
        )
        return [cells[0], cells.slice(1)]
      }),
    )
    expect(values).toEqual({
      "101": ["7", "9,007,199,254,740,993"],
      "102": ["11", "—"],
      "99": ["5", "0"],
    })
  })

  it("reports an incompatible bid schema without hiding valid asks", () => {
    // Given both queries succeeded, but only asks returned the bound size alias
    const price = { name: "price", type: "DOUBLE" }
    renderComponent(
      <VisualCanvas
        {...defaults}
        visual={{ type: "orderBook", columns: { size: "size" } }}
        statements={[
          {
            columns: [price, { name: "size", type: "DOUBLE" }],
            rows: [[101, 20]],
          },
          {
            columns: [price, { name: "volume", type: "DOUBLE" }],
            rows: [[99, 10]],
          },
        ]}
      />,
    )

    // Then the dashboard does not confuse that side with an empty market
    expect(screen.getByText("101")).toBeVisible()
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Bids: missing size column binding.",
    )
    expect(screen.queryByText("No bids")).not.toBeInTheDocument()
    expect(getRenderReport(bufferId, cellId)?.problems).toContainEqual({
      message: "Bids: missing size column binding.",
      severity: "error",
    })
  })

  it("writes the bound order-book column from the clicked side", async () => {
    const setVariables = vi.fn()
    const price = { name: "price", type: "DOUBLE" }
    const size = { name: "size", type: "DOUBLE" }
    const { container } = renderComponent(
      <VisualCanvas
        {...defaults}
        visual={{
          type: "orderBook",
          columns: { price: "price", size: "size" },
        }}
        statements={[
          { columns: [price, size], rows: [[101, 20]] },
          { columns: [size, price], rows: [[30, 99]] },
        ]}
        interactions={{ click: { variable: "amount", column: "size" } }}
        setVariables={setVariables}
      />,
    )
    const bid = container.querySelector<HTMLElement>(
      '[data-hook="order-book-bid"]',
    )
    const ask = container.querySelector<HTMLElement>(
      '[data-hook="order-book-ask"]',
    )
    expect(bid?.tagName).toBe("BUTTON")
    expect(ask?.tagName).toBe("BUTTON")
    bid?.focus()
    await userEvent.keyboard("{Enter}")
    ask?.focus()
    await userEvent.keyboard(" ")
    expect(setVariables.mock.calls).toEqual([
      [{ amount: "30" }],
      [{ amount: "20" }],
    ])
  })

  it.each([
    ["LONG", "9007199254740993", "9007199254740993"],
    ["DECIMAL(10,2)", "100.50", "100.50m"],
  ])(
    "writes an unbound order-book click on a %s price as a number",
    async (type, price, literal) => {
      // Given an order book whose click sets the level's price (the default),
      // with the price as QuestDB sends LONG and DECIMAL values: text
      const setVariables = vi.fn()
      const columns = [
        { name: "price", type },
        { name: "size", type: "DOUBLE" },
      ]
      const { container } = renderComponent(
        <VisualCanvas
          {...defaults}
          visual={{ type: "orderBook" }}
          statements={[
            { columns, rows: [[price, 2]] },
            { columns, rows: [["1", 3]] },
          ]}
          interactions={{ click: { variable: "px" } }}
          setVariables={setVariables}
        />,
      )

      // When the user clicks the ask level
      await userEvent.click(
        container.querySelector<HTMLElement>('[data-hook="order-book-ask"]')!,
      )

      // Then the variable holds the price as a number of its type, not text
      expect(setVariables.mock.calls).toEqual([[{ px: literal }]])
    },
  )

  it("writes a bound LONG click as a number and shows that tile selected", async () => {
    // Given stat tiles whose click sets a LONG id, sent as text
    const setVariables = vi.fn()
    const statements = [
      {
        columns: [
          { name: "desk", type: "SYMBOL" },
          { name: "desk_id", type: "LONG" },
          { name: "volume", type: "DOUBLE" },
        ],
        rows: [["London", "42", 5]],
      },
    ]
    const props = {
      ...defaults,
      visual: { type: "stat" as const, columns: { value: "volume" } },
      statements,
      interactions: { click: { variable: "desk", column: "desk_id" } },
      setVariables,
    }
    const { rerender } = renderComponent(<VisualCanvas {...props} />)

    // When the user clicks the tile
    await userEvent.click(screen.getByRole("button", { name: /London/ }))

    // Then the variable holds the number, and that value marks the tile
    expect(setVariables.mock.calls).toEqual([[{ desk: "42" }]])
    rerender(<VisualCanvas {...props} clickVariableValue="42" />)
    expect(
      screen.getByRole("button", { name: /London/, pressed: true }),
    ).toBeInTheDocument()
  })

  it("writes one consistent uptime lane binding from the keyboard and ignores ambiguous lanes", async () => {
    const setVariables = vi.fn()
    renderComponent(
      <VisualCanvas
        {...defaults}
        visual={{ type: "uptime" }}
        interactions={{ click: { variable: "asset", column: "asset_id" } }}
        setVariables={setVariables}
        statements={[
          {
            columns: [
              { name: "ts", type: "TIMESTAMP" },
              { name: "lane", type: "SYMBOL" },
              { name: "state", type: "SYMBOL" },
              { name: "asset_id", type: "INT" },
            ],
            rows: [
              ["2026-01-01T00:00:00Z", "west", "up", 42],
              ["2026-01-01T00:00:00Z", "east", "up", 7],
              ["2026-01-01T00:01:00Z", "east", "up", 8],
            ],
          },
        ]}
      />,
    )
    expect(
      screen.queryByRole("button", { name: /east/ }),
    ).not.toBeInTheDocument()
    screen.getByRole("button", { name: /west/ }).focus()
    await userEvent.keyboard("{Enter}")
    expect(setVariables).toHaveBeenCalledWith({ asset: "42" })
  })

  it("does not display a missing bullet measurement as zero", () => {
    renderComponent(
      <VisualCanvas
        {...defaults}
        visual={{
          type: "bullet",
          columns: { value: "usage", target: "limit" },
        }}
        statements={[
          {
            columns: [
              { name: "desk", type: "SYMBOL" },
              { name: "usage", type: "DOUBLE" },
              { name: "limit", type: "DOUBLE" },
            ],
            rows: [
              ["London", null, 100],
              ["Paris", 0, 100],
            ],
          },
        ]}
      />,
    )
    expect(screen.getByText("No measurement")).toBeVisible()
    expect(screen.getByText("· 0%")).toBeVisible()
  })

  it("selects and writes the configured stat source field rather than its label", async () => {
    const setVariables = vi.fn()
    renderComponent(
      <VisualCanvas
        bufferId={bufferId}
        cellId={cellId}
        visual={{ type: "stat", columns: { value: "volume" } }}
        statements={[
          {
            columns: [
              { name: "desk", type: "SYMBOL" },
              { name: "desk_id", type: "INT" },
              { name: "volume", type: "DOUBLE" },
            ],
            rows: [["London", 42, 5]],
          },
        ]}
        formats={{}}
        interactions={{ click: { variable: "desk", column: "desk_id" } }}
        clickVariableValue="42"
        setVariables={setVariables}
        live={false}
        isFocused
      />,
    )

    await userEvent.click(
      screen.getByRole("button", { name: /London/, pressed: true }),
    )
    expect(setVariables.mock.calls).toEqual([[{ desk: "42" }]])
  })

  it("writes the selected stat label as one SQL literal and reports the tiles drawn", async () => {
    const setVariables = vi.fn()
    renderComponent(
      <VisualCanvas
        bufferId={bufferId}
        cellId={cellId}
        visual={{ type: "stat" }}
        statements={[
          {
            columns: [
              { name: "desk", type: "SYMBOL" },
              { name: "volume", type: "DOUBLE" },
            ],
            rows: [["O'Reilly", 5]],
          },
        ]}
        formats={{}}
        interactions={{ click: { variable: "desk" } }}
        clickVariableValue="'London'"
        setVariables={setVariables}
        live={false}
        isFocused
      />,
    )

    await userEvent.click(screen.getByRole("button", { name: /O'Reilly/ }))
    expect(setVariables.mock.calls).toEqual([[{ desk: "'O''Reilly'" }]])
    expect(getRenderReport(bufferId, cellId)).toMatchObject({
      kind: "visual",
      drawn: { type: "stat", tiles: 1 },
      problems: [],
    })
  })
})
