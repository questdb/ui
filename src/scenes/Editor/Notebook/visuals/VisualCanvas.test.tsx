// @vitest-environment jsdom
import React from "react"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { renderComponent } from "../../../../test/component"
import { clearRenderReport, getRenderReport } from "../renderReports"
import { VisualCanvas } from "./VisualCanvas"

const bufferId = 11
const cellId = "dashboard-stat"

afterEach(() => clearRenderReport(bufferId, cellId))

describe("VisualCanvas", () => {
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
