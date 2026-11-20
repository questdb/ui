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

  it("rolls only changed mid-price digits and resets for a different query", () => {
    // Given a book with a mid price of 100.10 at two decimal places
    const columns = [
      { name: "price", type: "DOUBLE" },
      { name: "size", type: "DOUBLE" },
    ]
    const book = (mid: number, queriesKey = "BTC") => (
      <OrderBook
        queriesKey={queriesKey}
        formats={{ price: { kind: "price", decimals: 2 } }}
        statements={[
          { columns, rows: [[mid + 1, 2]] },
          { columns, rows: [[mid - 1, 10]] },
        ]}
      />
    )
    const { container, rerender } = renderComponent(book(100.1))
    const selector = '[data-hook="order-book-mid-digit"]'
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
