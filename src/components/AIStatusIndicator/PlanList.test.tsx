// @vitest-environment jsdom
import React from "react"
import { screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { renderComponent } from "../../test/component"
import { PlanList } from "./PlanList"

describe("PlanList", () => {
  it("names each item's state", () => {
    // When
    renderComponent(
      <PlanList
        entries={[
          { content: "Read the schema", status: "completed" },
          { content: "Write the query", status: "in_progress" },
          { content: "Chart it", status: "pending" },
        ]}
      />,
    )

    // Then
    expect(
      screen.getAllByRole("img").map((icon) => icon.getAttribute("aria-label")),
    ).toEqual(["Done", "In progress", "To do"])
  })

  it.each(Object.getOwnPropertyNames(Object.prototype))(
    "shows an item the agent marks %s as to do",
    (status) => {
      // When
      renderComponent(<PlanList entries={[{ content: "Chart it", status }]} />)

      // Then
      expect(screen.getByRole("img")).toHaveAttribute("aria-label", "To do")
    },
  )
})
