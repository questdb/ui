// @vitest-environment jsdom
import { renderComponent } from "../../../../test/component"
import React from "react"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { OrderBook } from "./OrderBook"
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

    // When selecting the ask, then the variable receives its exact price
    await userEvent.click(ask)
    expect(onSelect).toHaveBeenCalledWith("9007199254740993")
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
})
