// @vitest-environment jsdom
import React from "react"
import { screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { renderComponent } from "../../../../test/component"
import { ContextUsage } from "./ContextUsage"

const ring = () => screen.getByRole("img")

describe("ContextUsage", () => {
  it("shows how full the context is, in grey while there is room", () => {
    // When
    renderComponent(<ContextUsage usage={{ used: 42_000, size: 200_000 }} />)

    // Then
    expect(ring()).toHaveAccessibleName("Context: 42K of 200K tokens (21%)")
    expect(ring()).toHaveAttribute("data-level", "normal")
  })

  it("turns to the warning color once the context is 80% full", () => {
    // When
    renderComponent(<ContextUsage usage={{ used: 160_000, size: 200_000 }} />)

    // Then
    expect(ring()).toHaveAttribute("data-level", "high")
  })
})
