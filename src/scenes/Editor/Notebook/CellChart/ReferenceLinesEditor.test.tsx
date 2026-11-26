// @vitest-environment jsdom
import React, { useState } from "react"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { renderComponent } from "../../../../test/component"
import type { ReferenceLine } from "./chartTypes"
import {
  ReferenceLinesEditor,
  savedReferenceLines,
} from "./ReferenceLinesEditor"

const renderEditor = (initial: ReferenceLine[], hasRightAxis = false) => {
  const latest: { lines: ReferenceLine[] } = { lines: initial }
  const Editor = () => {
    const [lines, setLines] = useState(initial)
    return (
      <ReferenceLinesEditor
        lines={lines}
        hasRightAxis={hasRightAxis}
        onChange={(next) => {
          latest.lines = next
          setLines(next)
        }}
      />
    )
  }
  renderComponent(<Editor />)
  return latest
}

describe("ReferenceLinesEditor", () => {
  it("adds a line with a value and a label", async () => {
    // Given
    const latest = renderEditor([])

    // When
    await userEvent.click(screen.getByRole("button", { name: "+ Add line" }))
    await userEvent.type(screen.getByLabelText("Line 1 value"), "70")
    await userEvent.type(screen.getByLabelText("Line 1 label"), "Overbought")

    // Then
    expect(latest.lines).toEqual([{ value: 70, label: "Overbought" }])
  })

  it("removes the line asked for, keeping the others", async () => {
    // Given
    const latest = renderEditor([{ value: 30 }, { value: 70 }])

    // When
    await userEvent.click(screen.getByLabelText("Remove line 1"))

    // Then
    expect(latest.lines).toEqual([{ value: 70 }])
    expect(screen.getByLabelText("Line 1 value")).toHaveValue(70)
  })

  it("offers the axis only when the chart has a right one", () => {
    // When
    renderEditor([{ value: 30 }], true)

    // Then
    expect(screen.getByLabelText("Line 1 axis: Left")).toBeInTheDocument()
  })

  it("keeps the axis of a right line the chart cannot draw, and says it is removed on save", async () => {
    // Given a line on the right axis, which no query draws
    const latest = renderEditor([{ value: 30 }, { value: 70, axis: "right" }])

    // Then every line offers its axis, and the right one is flagged
    expect(screen.getByLabelText("Line 1 axis: Left")).not.toHaveAttribute(
      "aria-invalid",
    )
    const right = screen.getByRole("button", { name: "Line 2 axis: Right" })
    expect(right).toHaveAttribute("aria-invalid", "true")
    expect(right).toHaveAccessibleDescription(
      "No enabled query is on the right axis, so right-axis lines are removed on save. To keep a line, put a query on the right axis or draw the line on the left.",
    )

    // When the user moves it to the left
    await userEvent.click(right)
    await userEvent.click(screen.getByRole("menuitemradio", { name: "Left" }))

    // Then it is on the left, and with no right axis no line offers one
    expect(latest.lines).toEqual([{ value: 30 }, { value: 70 }])
    expect(
      screen.queryByRole("button", { name: /axis/ }),
    ).not.toBeInTheDocument()
  })
})

describe("savedReferenceLines", () => {
  it("keeps only the lines with a value", () => {
    expect(savedReferenceLines([{ value: NaN }, { value: 30 }])).toEqual([
      { value: 30 },
    ])
    expect(savedReferenceLines([{ value: NaN }])).toBeUndefined()
  })
})
