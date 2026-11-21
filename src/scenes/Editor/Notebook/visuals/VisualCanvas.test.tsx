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
