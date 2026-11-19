// @vitest-environment jsdom
import { renderComponent } from "../../../../test/component"
import React from "react"
import { fireEvent, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { DqlQueryResult } from "../../../../store/notebook"
import { ResultActionsBar } from "./ResultActionsBar"

const data = {
  type: "dql",
  query: "SELECT 1",
  columns: [{ name: "x", type: "INT" }],
  dataset: [[1]],
  count: 1,
} as DqlQueryResult

const renderBar = (
  props: Partial<React.ComponentProps<typeof ResultActionsBar>>,
) =>
  renderComponent(
    <ResultActionsBar
      data={data}
      gridRef={{ current: null }}
      isFrozen={false}
      hasSelection={false}
      {...props}
    />,
  )

describe("result actions bar live badge", () => {
  it("shows no badge without a live mode", () => {
    // Given / When
    renderBar({})

    // Then
    expect(screen.queryByRole("button", { name: /^Live updates/ })).toBeNull()
  })

  it("names the mode and opens the grid settings", () => {
    // Given
    const onOpenLiveUpdates = vi.fn()
    renderBar({ gridMode: "stream", onOpenLiveUpdates })

    // When
    const badge = screen.getByRole("button", {
      name: "Live updates: New rows flash. Open grid settings",
    })
    fireEvent.click(badge)

    // Then
    expect(badge).toHaveTextContent("New rows flash")
    expect(onOpenLiveUpdates).toHaveBeenCalledOnce()
  })

  it("says when the mode cannot match rows", () => {
    // Given / When
    renderBar({ gridMode: "stable", liveInactive: true })

    // Then
    expect(
      screen.getByRole("button", {
        name: "Live updates: Rows kept in place, waiting for columns that match rows. Open grid settings",
      }),
    ).toBeVisible()
  })
})
