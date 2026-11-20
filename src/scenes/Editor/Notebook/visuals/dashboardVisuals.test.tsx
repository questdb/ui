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
