// @vitest-environment jsdom
import React from "react"
import { fireEvent } from "@testing-library/react"
import { expect, it, vi } from "vitest"
import { renderComponent } from "../../../../test/component"
import type { StatementRows } from "./statementRows"

const counter = vi.hoisted(() => ({ bucketSeverity: 0 }))
vi.mock("./stateSegments", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./stateSegments")>()
  return {
    ...actual,
    bucketSeverity: (...args: Parameters<typeof actual.bucketSeverity>) => {
      counter.bucketSeverity++
      return actual.bucketSeverity(...args)
    },
  }
})

import { UptimeBars } from "./UptimeBars"

const T0 = Date.parse("2024-01-01T00:00:00Z")
const statement = (lanes: number): StatementRows => ({
  columns: [
    { name: "ts", type: "TIMESTAMP" },
    { name: "lane", type: "SYMBOL" },
    { name: "state", type: "SYMBOL" },
  ],
  rows: Array.from({ length: lanes * 48 }, (_, i) => [
    new Date(T0 + (i % 48) * 3_600_000).toISOString(),
    `svc-${Math.floor(i / 48)}`,
    i % 7 === 0 ? "down" : "up",
  ]),
})

it("redraws only the lanes whose hovered bar changed", () => {
  renderComponent(
    <UptimeBars
      visual={{ type: "uptime", buckets: 90 }}
      statements={[statement(5)]}
    />,
  )
  const lanes = Array.from(document.querySelectorAll("[data-lane-index]"))
  expect(lanes).toHaveLength(5)
  const barsPerLane = lanes[0].querySelectorAll("i").length
  const enter = (lane: number, bar: number) => {
    const before = counter.bucketSeverity
    fireEvent.mouseOver(lanes[lane].querySelectorAll("i")[bar])
    return counter.bucketSeverity - before
  }
  // Moving within a lane redraws that lane's bars only.
  expect(enter(0, 10)).toBe(barsPerLane)
  expect(enter(0, 11)).toBe(barsPerLane)
  // Moving to another lane redraws the lane left and the lane entered.
  expect(enter(3, 5)).toBe(2 * barsPerLane)
  // Re-entering the same bar redraws nothing.
  expect(enter(3, 5)).toBe(0)
  expect(document.querySelectorAll("[data-lane-index] i")).toHaveLength(
    5 * barsPerLane,
  )
})
