// @vitest-environment jsdom
import React from "react"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { renderComponent } from "../../../../test/component"
import { clearRenderReport, getRenderReport } from "../renderReports"
import { VisualCanvas } from "./VisualCanvas"

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
