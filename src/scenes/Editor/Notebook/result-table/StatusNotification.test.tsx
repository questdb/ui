// @vitest-environment jsdom
import React from "react"
import { expect, it } from "vitest"
import { renderComponent } from "../../../../test/component"
import { StatusNotification } from "./StatusNotification"
import type { StatementSlotView } from "./statementSlotView"

it("shows the latest refresh duration instead of the retained row frame's duration", () => {
  const old = {
    compiler: 0,
    authentication: 0,
    count: 0,
    execute: 7e9,
    fetch: 8e9,
  }
  const slot: StatementSlotView = {
    key: "select 1",
    sql: "select 1",
    refreshing: false,
    fetchedAt: 1000,
    timings: old,
    result: {
      type: "dql",
      query: "select 1",
      columns: [{ name: "x", type: "INT" }],
      dataset: [[1]],
      count: 1,
      timings: old,
    },
  }
  const { container, rerender } = renderComponent(
    <StatusNotification slot={slot} />,
  )
  expect(container.textContent).toContain("8s")
  rerender(
    <StatusNotification
      slot={{
        ...slot,
        fetchedAt: 2000,
        timings: { ...old, execute: 4e8, fetch: 5e8 },
      }}
    />,
  )
  expect(container.textContent).toContain("500ms")
  expect(container.textContent).not.toContain("8s")
  rerender(
    <StatusNotification
      slot={{ ...slot, fetchedAt: 3000, timings: undefined }}
    />,
  )
  expect(container.textContent).not.toContain("8s")
  expect(container.textContent).toContain("OK")
})
