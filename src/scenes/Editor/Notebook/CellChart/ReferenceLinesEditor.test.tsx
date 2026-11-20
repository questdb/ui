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
})

describe("savedReferenceLines", () => {
  it("keeps only the lines with a value", () => {
    expect(savedReferenceLines([{ value: NaN }, { value: 30 }])).toEqual([
      { value: 30 },
    ])
    expect(savedReferenceLines([{ value: NaN }])).toBeUndefined()
  })
})
