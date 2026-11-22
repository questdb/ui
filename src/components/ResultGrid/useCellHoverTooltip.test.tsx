// @vitest-environment jsdom
import React from "react"
import { act, fireEvent } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { renderComponent } from "../../test/component"
import { ResultGrid, inMemoryDataSource } from "./index"

vi.hoisted(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value: () => null,
  })
})

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(800)
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(600)
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, 800, 600),
  )
  // Every text box reports content wider than the box: the value is clipped.
  vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(5000)
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(100)
})

afterEach(() => {
  vi.useRealTimers()
})

it("previews a clipped cell value after the hover delay", () => {
  const wide = "a" + "b".repeat(499)
  renderComponent(
    <ResultGrid
      dataSource={inMemoryDataSource(
        [{ name: "wide", type: "VARCHAR" }],
        [[wide]],
        -1,
      )}
      maxColumnWidth="auto"
    />,
  )
  const text = document.querySelector('[data-hook="grid-cell-text"]')
  expect(text).not.toBeNull()
  vi.useFakeTimers()
  fireEvent.mouseOver(text as Element)
  act(() => {
    vi.advanceTimersByTime(699)
  })
  expect(
    document.querySelector('[data-hook="grid-cell-tooltip-value"]'),
  ).toBeNull()
  act(() => {
    vi.advanceTimersByTime(1)
  })
  expect(
    document.querySelector('[data-hook="grid-cell-tooltip-value"]')
      ?.textContent,
  ).toBe("a" + "b".repeat(399))
})
