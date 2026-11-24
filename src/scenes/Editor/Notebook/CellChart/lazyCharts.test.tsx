// @vitest-environment jsdom
import React from "react"
import { describe, expect, it, vi } from "vitest"
import { screen } from "@testing-library/react"
import { renderComponent } from "../../../../test/component"
import { ChartCodeBoundary } from "./lazyCharts"

const Throws = ({ error }: { error: Error }): React.ReactElement => {
  throw error
}

describe("ChartCodeBoundary", () => {
  it("turns a chart code download that failed into a message, not a blank console", () => {
    // Given a chart whose code did not download
    vi.spyOn(console, "error").mockImplementation(() => undefined)

    // When
    renderComponent(
      <ChartCodeBoundary>
        <Throws
          error={
            new TypeError(
              "Failed to fetch dynamically imported module: /assets/echartsSetup-x.js",
            )
          }
        />
      </ChartCodeBoundary>,
    )

    // Then
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not load the chart code.",
    )
    expect(
      screen.getByRole("button", { name: "Reload the console" }),
    ).toBeVisible()
  })

  it("leaves other errors to the boundaries above it", () => {
    // Given a chart that throws while drawing
    vi.spyOn(console, "error").mockImplementation(() => undefined)

    // When / Then
    expect(() =>
      renderComponent(
        <ChartCodeBoundary>
          <Throws error={new Error("bad option")} />
        </ChartCodeBoundary>,
      ),
    ).toThrow("bad option")
  })
})
