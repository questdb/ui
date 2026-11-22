// @vitest-environment jsdom
import React from "react"
import { screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { renderComponent } from "../../../test/component"
import { NoticeRecord } from "./NoticeRecord"

describe("a notice in an agent's reply", () => {
  it("shows as a notice, with its severity and description", () => {
    // When
    renderComponent(
      <NoticeRecord
        notice={{
          severity: "warning",
          title: "The agent reached its step limit",
          description: "Ask it to continue.",
        }}
      />,
    )

    // Then
    const notice = screen.getByRole("alert")
    expect(notice).toHaveAttribute("data-severity", "warning")
    expect(notice).toHaveTextContent("The agent reached its step limit")
    expect(notice).toHaveTextContent("Ask it to continue.")
  })
})
