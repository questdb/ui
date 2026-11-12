// @vitest-environment jsdom
import React from "react"
import { act, fireEvent, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { renderComponent, getHook, queryHook } from "../../test/component"
import { SearchPanel } from "./SearchPanel"
import { db } from "../../store/db"
import { makeBuffer, type Buffer } from "../../store/buffers"

vi.mock("../../providers", () => ({
  useSearch: () => ({ setSearchPanelOpen: vi.fn() }),
  useEditor: () => ({
    buffers: [],
    editorRef: { current: null },
    setActiveBuffer: vi.fn(),
    previewBuffer: vi.fn(),
  }),
}))
vi.mock("../../modules/ConsoleEventTracker", () => ({ trackEvent: vi.fn() }))
// Render the real search rows without windowing. Native scrolling and editor navigation stay in E2E.
vi.mock("../../components/VirtualizedTree", async () => {
  const { forwardRef } = await import("react")
  return {
    VirtualizedTree: forwardRef(
      (
        {
          items,
          renderItem,
        }: {
          items: { id: string }[]
          renderItem: (
            item: unknown,
            index: number,
            focused: boolean,
          ) => React.ReactNode
        },
        _ref,
      ) => (
        <>
          {items.map((item, index) => (
            <React.Fragment key={item.id}>
              {renderItem(item, index, false)}
            </React.Fragment>
          ))}
        </>
      ),
    ),
  }
})

const rows = () =>
  Array.from(document.querySelectorAll('[data-hook="search-result-match"]'))
const groups = () =>
  Array.from(
    document.querySelectorAll('[data-hook="search-result-buffer-group"]'),
  )
const marks = () =>
  rows().flatMap((row) =>
    Array.from(row.querySelectorAll("mark")).map((mark) => mark.textContent),
  )
const search = async (query: string) => {
  fireEvent.change(getHook("search-input"), { target: { value: query } })
  fireEvent.keyDown(getHook("search-input"), { key: "Enter" })
  await act(async () => {})
}
const expectSummary = async (text: string) =>
  waitFor(() => expect(getHook("search-summary")).toHaveTextContent(text))
const toggle = (name: string) =>
  fireEvent.click(getHook(`search-option-${name}`))
const showSearch = async (buffers: Partial<Buffer>[]) => {
  await db.buffers.bulkAdd(
    buffers.map((buffer, position) =>
      makeBuffer({ label: `Tab ${position}`, position, ...buffer }),
    ),
  )
  return renderComponent(<SearchPanel open />)
}
beforeEach(async () => {
  await db.buffers.clear()
})

const prices =
  "-- Daily OHLC aggregation for major cryptocurrency symbols\nSELECT \n  SYMBOL,\nfirst(price) as open_price,\nmax(price) as high_price,\nmin(price) as low_price,\nlast(price) as close_price,\nsum(volume) as total_volume\nFROM crypto_trades \nWHERE SYMBOL IN ('BTC-USD', 'ETH-USD', 'ADA-USD');\n"

describe("search options and results", () => {
  it("clears old matches when a search has no results", async () => {
    // Given
    await showSearch([
      { value: "select * from trades" },
      { value: "select count(*) from trades" },
    ])
    await search("trades")
    await expectSummary("2 results in 2 tabs")
    // When
    await search("nonexistenttext123")
    // Then
    await waitFor(() =>
      expect(queryHook("search-no-results")).toBeInTheDocument(),
    )
    expect(rows()).toHaveLength(0)
  })
  it("switches case sensitivity in both directions", async () => {
    // Given
    await showSearch([{ value: prices }])
    await search("symbol")
    await expectSummary("3 results in 1 tab")
    expect(getHook("search-option-case-sensitive")).toHaveAttribute(
      "aria-pressed",
      "false",
    )
    // When
    toggle("case-sensitive")
    // Then
    await expectSummary("1 result in 1 tab")
    expect(getHook("search-option-case-sensitive")).toHaveAttribute(
      "aria-pressed",
      "true",
    )
    // When
    toggle("case-sensitive")
    // Then
    await expectSummary("3 results in 1 tab")
    expect(getHook("search-option-case-sensitive")).toHaveAttribute(
      "aria-pressed",
      "false",
    )
  })
  it("switches whole-word matching without treating underscores as boundaries", async () => {
    // Given
    await showSearch([{ value: prices }])
    await search("price")
    await expectSummary("8 results in 1 tab")
    // When
    toggle("whole-word")
    // Then
    await waitFor(() => expect(rows()).toHaveLength(4))
    expect(getHook("search-option-whole-word")).toHaveAttribute(
      "aria-pressed",
      "true",
    )
    await search("open_price")
    await waitFor(() => expect(rows()).toHaveLength(1))
    // When
    toggle("whole-word")
    await search("price")
    // Then
    await expectSummary("8 results in 1 tab")
    expect(getHook("search-option-whole-word")).toHaveAttribute(
      "aria-pressed",
      "false",
    )
  })
  it("renders exact regex matches and removes them when regex is disabled", async () => {
    // Given
    await showSearch([
      { value: "SELECT 'BTC-ETH';\nSELECT 'ETH-BTC';\nSELECT 'USD-TRY';" },
    ])
    // When
    toggle("regex")
    await search("[A-Z]{3}-[A-Z]{3}")
    // Then
    await expectSummary("3 results in 1 tab")
    expect(marks()).toEqual(["BTC-ETH", "ETH-BTC", "USD-TRY"])
    expect(getHook("search-option-regex")).toHaveAttribute(
      "aria-pressed",
      "true",
    )
    // When
    toggle("regex")
    // Then
    await waitFor(() =>
      expect(queryHook("search-no-results")).toBeInTheDocument(),
    )
    expect(rows()).toHaveLength(0)
    expect(getHook("search-option-regex")).toHaveAttribute(
      "aria-pressed",
      "false",
    )
  })
  it("includes archived tabs by default and restores them after toggling", async () => {
    // Given
    await showSearch([
      { value: "portfolio returns" },
      { value: "portfolio positions", archived: true, archivedAt: 1 },
      { value: "portfolio risk" },
    ])
    await search("portfolio")
    await expectSummary("3 results in 3 tabs")
    expect(getHook("search-option-include-closed")).toBeChecked()
    // When
    toggle("include-closed")
    // Then
    await expectSummary("2 results in 2 tabs")
    expect(groups().every((row) => !row.textContent?.includes("closed"))).toBe(
      true,
    )
    // When
    toggle("include-closed")
    // Then
    await expectSummary("3 results in 3 tabs")
    expect(
      groups().filter((row) =>
        row.getAttribute("aria-label")?.includes("closed"),
      ),
    ).toHaveLength(1)
  })
  it("clears matches and the summary when the input is emptied", async () => {
    // Given
    await showSearch([{ value: "SELECT symbol FROM trades" }])
    await search("symbol")
    await expectSummary("1 result in 1 tab")
    // When
    await search("")
    // Then
    await waitFor(() => expect(rows()).toHaveLength(0))
    expect(getHook("search-summary").textContent).toBe("")
    expect(queryHook("search-no-results")).not.toBeInTheDocument()
  })
  it("finds punctuation in an email as literal text", async () => {
    // Given
    await showSearch([{ value: "SELECT 'john.doe+crypto@trading-firm.com'" }])
    // When
    await search("@trading-firm.com")
    // Then
    await expectSummary("1 result in 1 tab")
    expect(marks()).toEqual(["@trading-firm.com"])
  })
  it("Enter starts search before its debounce elapses", async () => {
    // Given
    await showSearch([{ value: "SELECT * FROM active_positions" }])
    vi.useFakeTimers()
    fireEvent.change(getHook("search-input"), {
      target: { value: "active_positions" },
    })
    expect(rows()).toHaveLength(0)
    // When
    fireEvent.keyDown(getHook("search-input"), { key: "Enter" })
    vi.useRealTimers()
    // Then
    await expectSummary("1 result in 1 tab")
    expect(marks()).toEqual(["active_positions"])
  })
  it("groups rows by tab and updates each group count", async () => {
    // Given
    await showSearch([
      {
        label: "Trader totals",
        value: "trader_email\nWHERE trader_email\ntrader_email",
      },
      {
        label: "Customer totals",
        value: "customer_email\nWHERE customer_email",
      },
    ])
    // When
    await search("_email")
    await expectSummary("5 results in 2 tabs")
    // Then
    expect(groups().map((row) => row.textContent)).toEqual([
      expect.stringContaining("Trader totals"),
      expect.stringContaining("Customer totals"),
    ])
    expect(rows()).toHaveLength(5)
    rows().forEach((row, index) =>
      expect(row).toHaveTextContent(
        index < 3 ? "trader_email" : "customer_email",
      ),
    )
    expect(groups()[0]).toHaveTextContent("3 results")
    // When
    await search("WHERE")
    await expectSummary("2 results in 2 tabs")
    // Then
    expect(groups()[0]).toHaveTextContent("1 result")
    expect(groups()[0]).not.toHaveTextContent("3 results")
    expect(rows()[0]).toHaveTextContent("WHERE trader_email")
    expect(marks()).toEqual(["WHERE", "WHERE"])
  })
  it("shows a title-only result with its highlighted name", async () => {
    // Given
    await showSearch([
      { label: "crypto analysis", value: "SELECT 1" },
      { label: "portfolio cleanup", value: "SELECT 2" },
    ])
    // When
    await search("crypto")
    await expectSummary("1 result in 1 tab")
    // Then
    expect(getHook("search-result-title-match-text")).toHaveTextContent(
      "crypto analysis",
    )
    expect(
      getHook("search-result-title-match-text").querySelector("mark"),
    ).toHaveTextContent("crypto")
    expect(rows()).toHaveLength(0)
    expect(groups()).toHaveLength(0)
  })
  it("marks archived title-only results as closed", async () => {
    // Given
    await showSearch([
      {
        label: "position tracking",
        value: "trading_positions",
        archived: true,
        archivedAt: 1,
      },
    ])
    // When
    toggle("whole-word")
    await search("position")
    await expectSummary("1 result in 1 tab")
    // Then
    expect(
      getHook("search-result-title-match-closed-status"),
    ).toHaveTextContent("closed")
    expect(rows()).toHaveLength(0)
    expect(groups()).toHaveLength(0)
  })
  it("combines a title and content match under one group", async () => {
    // Given
    await showSearch([
      { label: "crypto price query", value: "SELECT price FROM crypto_trades" },
    ])
    // When
    await search("crypto")
    await expectSummary("2 results in 1 tab")
    // Then
    expect(groups()).toHaveLength(1)
    expect(rows()).toHaveLength(1)
    expect(groups()[0].querySelector("mark")).toHaveTextContent("crypto")
    expect(groups()[0]).toHaveTextContent("1 result")
    expect(queryHook("search-result-title-match")).not.toBeInTheDocument()
  })
  it("replaces matches with a regex error, then recovers on valid input or empty input", async () => {
    // Given
    await showSearch([
      { value: "SELECT symbol FROM trades WHERE symbol='BTC'" },
    ])
    toggle("regex")
    await search("symbol")
    await expectSummary("2 results in 1 tab")
    // When
    await search("[invalid-regex")
    // Then
    await waitFor(() =>
      expect(getHook("search-error")).toHaveTextContent(
        "Invalid regular expression",
      ),
    )
    expect(rows()).toHaveLength(0)
    // When
    await search("symbol")
    await expectSummary("2 results in 1 tab")
    // Then
    expect(queryHook("search-error")).not.toBeInTheDocument()
    // When
    await search("(unclosed-group")
    // Then
    await waitFor(() =>
      expect(getHook("search-error")).toHaveTextContent(
        "Invalid regular expression",
      ),
    )
    // When
    await search("")
    // Then
    await waitFor(() =>
      expect(queryHook("search-error")).not.toBeInTheDocument(),
    )
    expect(rows()).toHaveLength(0)
    expect(queryHook("search-no-results")).not.toBeInTheDocument()
    expect(getHook("search-summary").textContent).toBe("")
  })
  it("escapes every literal regex character without changing highlighted text", async () => {
    // Given
    const literals = [
      "^BTC.*$",
      "[A-Z]+",
      "\\.(ETH|BTC)\\*",
      "/path/to/file+backup",
      "price >= $100 && volume",
      "%profit: +15.5%",
      "@.*\\.(com|org)",
      "(email",
      ")",
      "*",
      ".",
    ]
    await showSearch([
      {
        value:
          "-- Find patterns with special characters\n" +
          "SELECT * FROM prices WHERE pattern = '^BTC.*$';\n" +
          "INSERT INTO regex_patterns VALUES ('[A-Z]+\\.(ETH|BTC)\\*');\n" +
          "INSERT INTO logs VALUES('Error: File not found at /path/to/file+backup');\n" +
          "CREATE TABLE test_patterns (id INT, email VARCHAR(50) CHECK (email ~ '@.*\\.(com|org)'));\n" +
          "-- Special query: price >= $100 && volume > 1000\n" +
          "SELECT COUNT(*) FROM trades WHERE notes LIKE '%profit: +15.5%';\n",
      },
    ])
    // When / Then
    for (const [index, term] of literals.entries()) {
      await search(term)
      const count = [1, 1, 1, 1, 1, 1, 1, 1, 8, 5, 5][index]
      await expectSummary(`${count} result${count > 1 ? "s" : ""} in 1 tab`)
      await waitFor(() =>
        expect(marks().every((mark) => mark === term)).toBe(true),
      )
      expect(queryHook("search-error")).not.toBeInTheDocument()
    }
  })
  it("distinguishes a regex alternation from its escaped literal", async () => {
    // Given
    await showSearch([
      {
        value:
          "SELECT price FROM btc_trades;\nSELECT price FROM eth_trades;\nSELECT price FROM ada_trades;",
      },
    ])
    // When
    toggle("regex")
    await search("(btc|eth)_trades")
    // Then
    await expectSummary("2 results in 1 tab")
    expect(marks()).toEqual(["btc_trades", "eth_trades"])
    // When
    await search("\\(btc\\|eth\\)_trades")
    // Then
    await waitFor(() =>
      expect(queryHook("search-no-results")).toBeInTheDocument(),
    )
    expect(rows()).toHaveLength(0)
    expect(queryHook("search-error")).not.toBeInTheDocument()
  })
  it("applies all eight combinations to exact matches and line numbers", async () => {
    // Given
    const words = [
      "Find",
      "product",
      "in",
      "production",
      "PRODUCT",
      "products",
      "Product",
      "testX",
      "text",
      "teXt",
    ]
    await showSearch([{ value: words.join("\n") }])
    const check = async (indices: number[]) => {
      await waitFor(() =>
        expect(
          rows().map((row) =>
            Number(
              row.querySelector('[data-hook="search-result-line-number"]')
                ?.textContent,
            ),
          ),
        ).toEqual(indices.map((i) => i + 1)),
      )
      rows().forEach((row, index) =>
        expect(row).toHaveTextContent(words[indices[index]]),
      )
    }
    // When / Then
    await search("product")
    await check([1, 3, 4, 5, 6])
    toggle("case-sensitive")
    await check([1, 3, 5])
    toggle("whole-word")
    await check([1])
    toggle("case-sensitive")
    await check([1, 4, 6])
    await search("te[sx]t")
    toggle("regex")
    await check([8, 9])
    toggle("whole-word")
    await check([7, 8, 9])
    toggle("case-sensitive")
    await check([7, 8])
    toggle("whole-word")
    await check([8])
  })
})
