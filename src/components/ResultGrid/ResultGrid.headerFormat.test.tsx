// @vitest-environment jsdom
import React from "react"
import { screen } from "@testing-library/react"
import { beforeEach, expect, it, vi } from "vitest"
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
})

const ROOT_FONT_PX = 10
// The button stays hidden until its header is hovered, so it is looked up
// by its label rather than as an accessible role.
const formatButton = (label: string) => {
  const button = document.querySelector(`button[aria-label="${label}"]`)
  if (!button) throw new Error(`${label} not rendered`)
  return button
}
const toPx = (length: string) =>
  length.endsWith("rem")
    ? parseFloat(length) * ROOT_FONT_PX
    : parseFloat(length)

it("keeps the Format column buttons clear of the neighbouring resize handles", () => {
  // Given a text column next to a numeric and an array column
  renderComponent(
    <ResultGrid
      dataSource={inMemoryDataSource(
        [
          { name: "sym", type: "SYMBOL" },
          { name: "px", type: "DOUBLE" },
          { name: "arr", type: "ARRAY", dim: 1, elemType: "DOUBLE" },
        ],
        [["BTC", 1, null]],
        -1,
      )}
      maxColumnWidth="auto"
      onFormatColumn={vi.fn()}
    />,
  )
  // A resize handle reaches this far into the headers on both sides of it
  const resizer = getComputedStyle(
    screen.getByRole("separator", { name: "Resize column sym" }),
  )
  const reach = toPx(resizer.width) + toPx(resizer.right)

  // Then the right-aligned number's button starts past the previous handle
  const px = getComputedStyle(formatButton("Format column px"))
  expect(toPx(px.left)).toBeGreaterThan(reach)
  // And the left-aligned array's button ends before its own handle
  const arr = getComputedStyle(formatButton("Format column arr"))
  expect(toPx(arr.right)).toBeGreaterThan(reach)
})
