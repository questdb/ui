// @vitest-environment jsdom
import { renderComponent } from "../../../../test/component"
import React from "react"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { MAX_ORDER_BOOK_LEVELS, OrderBook, orderBookDrawn } from "./OrderBook"
import { StatTiles } from "./StatTiles"
import type { StatementRows } from "./statementRows"

describe("dashboard visuals", () => {
  it("shows the current notebook selection and supports keyboard selection", async () => {
    // Given stat tiles bound to the notebook's symbol variable
    const statements: StatementRows[] = [
      {
        columns: [
          { name: "symbol", type: "SYMBOL" },
          { name: "price", type: "DOUBLE" },
        ],
        rows: [
          ["BTC", 100],
          ["ETH", 20],
        ],
      },
    ]
    const onSelect = vi.fn()
    const tiles = (selectedValue: string) => (
      <StatTiles
        visual={{ type: "stat" }}
        formats={{}}
        statements={statements}
        onSelect={onSelect}
        selectedValue={selectedValue}
      />
    )
    const { rerender } = renderComponent(tiles("'BTC'"))
    const btc = screen.getByRole("button", { name: /BTC/, pressed: true })
    const eth = screen.getByRole("button", { name: /ETH/, pressed: false })

    // When the user selects ETH and the notebook variable updates
    eth.focus()
    await userEvent.keyboard("{Enter}")
    rerender(tiles("'ETH'"))

    // Then the selected state follows the variable and focus stays on the tile
    expect(onSelect).toHaveBeenCalledWith("ETH")
    expect(btc).toHaveAttribute("aria-pressed", "false")
    expect(eth).toHaveAttribute("aria-pressed", "true")
    expect(eth).toHaveFocus()
  })

  it("marks the tile of a LONG id the variable holds as a number", () => {
    // Given tiles that select their LONG id, which arrives as text
    renderComponent(
      <StatTiles
        visual={{ type: "stat" }}
        formats={{}}
        clickColumn="id"
        statements={[
          {
            columns: [
              { name: "desk", type: "SYMBOL" },
              { name: "pnl", type: "DOUBLE" },
              { name: "id", type: "LONG" },
            ],
            rows: [
              ["east", 1, "41"],
              ["west", 2, "42"],
            ],
          },
        ]}
        onSelect={vi.fn()}
        selectedValue="42"
      />,
    )
    // Then the tile with that id is the pressed one
    expect(screen.getByRole("button", { name: /west/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    )
    expect(screen.getByRole("button", { name: /east/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    )
  })

  it("keeps exact LONG prices distinct when calculating spread and midpoint", async () => {
    // Given adjacent LONGs that collapse to the same double
    const columns = [
      { name: "price", type: "LONG" },
      { name: "size", type: "INT" },
    ]
    const onSelect = vi.fn()
    const { container } = renderComponent(
      <OrderBook
        formats={{}}
        onSelect={onSelect}
        statements={[
          { columns, rows: [["9007199254740993", 2]] },
          { columns, rows: [["9007199254740992", 10]] },
        ]}
      />,
    )
    const ask = screen.getByRole("button", { name: /9,007,199,254,740,993/ })
    expect(
      screen.getByRole("button", { name: /9,007,199,254,740,992/ }),
    ).toBeVisible()
    expect(
      container.querySelector('[data-hook="order-book-mid-price"]'),
    ).toHaveTextContent("9,007,199,254,740,992.5")
    expect(screen.getByText(/^Spread/).querySelector("b")).toHaveTextContent(
      /^1$/,
    )

    // When selecting the ask, it selects its exact price, typed by its column
    await userEvent.click(ask)
    expect(onSelect).toHaveBeenCalledWith("9007199254740993", "LONG")
  })

  it("renders the exact size of a LONG without compact formatting", () => {
    const columns = [
      { name: "price", type: "DOUBLE" },
      { name: "size", type: "LONG" },
    ]
    renderComponent(
      <OrderBook
        formats={{ size: { decimals: 0 } }}
        statements={[
          { columns, rows: [[102, "9007199254740993"]] },
          { columns, rows: [[100, "9007199254740992"]] },
        ]}
      />,
    )
    expect(screen.getByText("9,007,199,254,740,993")).toBeVisible()
    expect(screen.getByText("9,007,199,254,740,992")).toBeVisible()
  })

  it("rolls only changed mid-price digits and resets for a different query", () => {
    // Given a book with a mid price of 100.10 at two decimal places
    const columns = [
      { name: "price", type: "DOUBLE" },
      { name: "size", type: "DOUBLE" },
    ]
    const book = (mid: number, queriesKey = "BTC") => (
      <OrderBook
        animateDigits
        queriesKey={queriesKey}
        formats={{ price: { kind: "price", decimals: 2 } }}
        statements={[
          { columns, rows: [[mid + 1, 2]] },
          { columns, rows: [[mid - 1, 10]] },
        ]}
      />
    )
    const { container, rerender } = renderComponent(book(100.1))
    const selector = '[data-hook="rolling-digit"]'
    const digit = () => container.querySelector(selector)
    expect(digit()).toBeNull()

    // When a refresh changes the last displayed digit and the next rounds away
    rerender(book(100.12))
    const rollingDigit = digit()
    rerender(book(100.121))

    // Then only that digit rolls, and the rounded update does not restart it
    expect(container.querySelectorAll(selector)).toHaveLength(1)
    expect(rollingDigit).toHaveTextContent("02")
    expect(digit()).toBe(rollingDigit)

    // When the price falls and then the selected symbol changes
    rerender(book(100.11))
    expect(digit()).toHaveTextContent("21")
    expect(
      container.querySelector('[data-hook="order-book-mid-price"]'),
    ).toHaveTextContent("↓")
    rerender(book(100.15, "ETH"))

    // Then the new book's first price is static
    expect(digit()).toBeNull()
  })

  it("rolls stat tile values only when enabled", () => {
    // Given a stat tile with the default motion setting
    const columns = [{ name: "price", type: "DOUBLE" }]
    const tile = (price: number, animateDigits?: boolean) => (
      <StatTiles
        visual={{ type: "stat", animateDigits }}
        formats={{ price: { kind: "price", decimals: 2 } }}
        statements={[{ columns, rows: [[price]] }]}
      />
    )
    const { container, rerender } = renderComponent(tile(12.1))
    const digit = () => container.querySelector('[data-hook="rolling-digit"]')

    // When it refreshes with no setting, then with motion enabled
    rerender(tile(12.11))
    expect(digit()).toBeNull()
    rerender(tile(12.11, true))
    rerender(tile(12.12, true))

    // Then only the new last digit rolls, and turning it off removes the motion
    expect(digit()).toHaveTextContent("12")
    rerender(tile(12.12, false))
    expect(digit()).toBeNull()
  })

  it("shows every row of a price repeated in an unaggregated book", () => {
    // Given asks that repeat a price, as a query without GROUP BY returns
    const columns = [
      { name: "price", type: "DOUBLE" },
      { name: "size", type: "DOUBLE" },
    ]
    const book = (asks: [number, number][]) => (
      <OrderBook
        formats={{}}
        statements={[
          { columns, rows: asks },
          { columns, rows: [[99, 10]] },
        ]}
      />
    )
    const errors = vi.spyOn(console, "error").mockImplementation(() => {})
    const { container, rerender } = renderComponent(
      book([
        [101, 2],
        [101, 3],
        [102, 1],
      ]),
    )

    // When a refresh changes how often the price repeats
    rerender(
      book([
        [101, 4],
        [102, 1],
      ]),
    )
    rerender(
      book([
        [101, 5],
        [101, 6],
        [101, 7],
        [102, 1],
      ]),
    )

    // Then each ask row of the latest result is drawn, once
    const sizes = Array.from(
      container.querySelectorAll<HTMLElement>('[data-hook="order-book-ask"]'),
      (row) => row.querySelectorAll("span")[1]?.textContent,
    )
    expect(sizes.sort()).toEqual(["1", "5", "6", "7"])
    // without React losing track of rows that share a key
    expect(
      errors.mock.calls.some((args) => String(args[0]).includes("same key")),
    ).toBe(false)
  })

  it("keeps a price level mounted while its depth changes", () => {
    // Given an order book with a smaller ask than bid
    const columns = [
      { name: "price", type: "DOUBLE" },
      { name: "size", type: "DOUBLE" },
    ]
    const book = (size: number) => (
      <OrderBook
        formats={{}}
        statements={[
          { columns, rows: [[101, size]] },
          { columns, rows: [[99, 10]] },
        ]}
      />
    )
    const { container, rerender } = renderComponent(book(2))
    const ask = container.querySelector('[data-hook="order-book-ask"]')
    const bar = ask?.querySelector("i")
    expect(bar).toHaveStyle({ width: "20%" })

    // When the size changes at the same price
    rerender(book(4))

    // Then the same bar receives the new width instead of remounting to flash
    expect(container.querySelector('[data-hook="order-book-ask"] i')).toBe(bar)
    expect(bar).toHaveStyle({ width: "40%" })
  })
  it.each([
    ["top", "ask", [0, 36], [10, 32], -26],
    ["bottom", "bid", [264, 300], [270, 292], 28],
  ] as const)(
    "scrolls a focused level out from under the mid bar stuck to the %s",
    (_edge, side, [barTop, barBottom], [rowTop, rowBottom], scrolled) => {
      // Given a clickable ladder that scrolled the mid bar to one of its edges
      const columns = [
        { name: "price", type: "DOUBLE" },
        { name: "size", type: "DOUBLE" },
      ]
      const { container } = renderComponent(
        <OrderBook
          formats={{}}
          onSelect={vi.fn()}
          statements={[
            { columns, rows: [[101, 1]] },
            { columns, rows: [[99, 1]] },
          ]}
        />,
      )
      const level = container.querySelector<HTMLElement>(
        `[data-hook="order-book-${side}"]`,
      )
      const bar = screen.getByText("Spread", { exact: false }).parentElement
      const ladder = bar?.parentElement
      if (!level || !bar || !ladder) throw new Error("order book not rendered")
      let scrollTop = 500
      Object.defineProperty(ladder, "scrollTop", {
        configurable: true,
        get: () => scrollTop,
        set: (next: number) => {
          scrollTop = next
        },
      })
      const rect = (top: number, bottom: number) =>
        new DOMRect(0, top, 300, bottom - top)
      vi.spyOn(ladder, "getBoundingClientRect").mockReturnValue(rect(0, 300))
      vi.spyOn(bar, "getBoundingClientRect").mockReturnValue(
        rect(barTop, barBottom),
      )
      vi.spyOn(level, "getBoundingClientRect").mockReturnValue(
        rect(rowTop, rowBottom),
      )

      // When keyboard focus lands on a level the bar covers
      level.focus()

      // Then the ladder scrolls just far enough to show that level
      expect(level).toHaveFocus()
      expect(scrollTop).toBe(500 + scrolled)
    },
  )

  it("names each clickable level with its side", () => {
    // Given a locked book: the best ask and best bid share price and size
    const columns = [
      { name: "price", type: "DOUBLE" },
      { name: "size", type: "DOUBLE" },
    ]
    renderComponent(
      <OrderBook
        formats={{}}
        onSelect={vi.fn()}
        statements={[
          { columns, rows: [[100, 2]] },
          { columns, rows: [[100, 2]] },
        ]}
      />,
    )

    // Then a screen reader tells the two levels apart
    expect(
      screen.getByRole("button", { name: "Ask 100, size 2" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Bid 100, size 2" }),
    ).toBeInTheDocument()
  })

  it("keeps the ladder where it is when the ladder itself takes focus", () => {
    // Given an order book whose mid bar overlaps the ladder's own box
    const columns = [
      { name: "price", type: "DOUBLE" },
      { name: "size", type: "DOUBLE" },
    ]
    renderComponent(
      <OrderBook
        formats={{}}
        statements={[
          { columns, rows: [[101, 1]] },
          { columns, rows: [[99, 1]] },
        ]}
      />,
    )
    const bar = screen.getByText("Spread", { exact: false }).parentElement
    const ladder = bar?.parentElement
    if (!bar || !ladder) throw new Error("order book not rendered")
    let scrollTop = 500
    Object.defineProperty(ladder, "scrollTop", {
      configurable: true,
      get: () => scrollTop,
      set: (next: number) => {
        scrollTop = next
      },
    })
    const rect = (top: number, bottom: number) =>
      new DOMRect(0, top, 300, bottom - top)
    vi.spyOn(ladder, "getBoundingClientRect").mockReturnValue(rect(0, 300))
    vi.spyOn(bar, "getBoundingClientRect").mockReturnValue(rect(132, 168))
    ladder.tabIndex = 0

    // When Tab lands on the scrollable ladder (Firefox, or rows without a click)
    ladder.focus()

    // Then the ladder does not scroll away from the centred mid price
    expect(ladder).toHaveFocus()
    expect(scrollTop).toBe(500)
  })

  it("lists the levels nearest the spread of a deep book and says how many", () => {
    const columns = [
      { name: "price", type: "DOUBLE" },
      { name: "size", type: "DOUBLE" },
    ]
    const depth = MAX_ORDER_BOOK_LEVELS + 300
    const statements = [
      {
        columns,
        rows: Array.from({ length: depth }, (_, i) => [101 + i, 1]),
      },
      { columns, rows: Array.from({ length: 3 }, (_, i) => [99 - i, 1]) },
    ]
    const { container } = renderComponent(
      <OrderBook formats={{}} statements={statements} />,
    )
    const asks = container.querySelectorAll('[data-hook="order-book-ask"]')
    expect(asks).toHaveLength(MAX_ORDER_BOOK_LEVELS)
    // The best ask sits next to the mid price; the deepest shown is the cap.
    expect(asks[asks.length - 1]).toHaveTextContent("101")
    expect(asks[0]).toHaveTextContent(String(100 + MAX_ORDER_BOOK_LEVELS))
    expect(
      container.querySelectorAll('[data-hook="order-book-bid"]'),
    ).toHaveLength(3)
    const notice = `Showing the first ${MAX_ORDER_BOOK_LEVELS} of ${depth} asks.`
    expect(screen.getByText(notice)).toBeVisible()
    expect(orderBookDrawn(statements)).toMatchObject({
      drawn: { asks: MAX_ORDER_BOOK_LEVELS, bids: 3 },
      problems: [{ message: notice, severity: "warning" }],
    })
  })
})
