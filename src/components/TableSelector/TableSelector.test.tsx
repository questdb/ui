// @vitest-environment jsdom
import React from "react"
import { act, fireEvent } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { getHook, queryHook, renderComponent } from "../../test/component"
import { TableSelector } from "."

const options = [
  { label: "alpha", value: "alpha" },
  { label: "beta", value: "beta" },
]

const open = () => {
  renderComponent(
    <TableSelector options={options} onSelect={vi.fn()} value="alpha" />,
  )
  const input = getHook("table-selector-input") as HTMLInputElement
  act(() => {
    fireEvent.click(getHook("table-selector-trigger"))
  })
  return input
}

// fireEvent returns false when a handler called preventDefault, i.e. claimed it.
const escape = (target: Element) => {
  let notClaimed = true
  act(() => {
    notClaimed = fireEvent.keyDown(target, { key: "Escape", code: "Escape" })
  })
  return notClaimed
}

const isOpen = () => queryHook("table-selector-dropdown") !== null

describe("TableSelector Escape", () => {
  it("clears the search first, then closes the dropdown", () => {
    const input = open()
    act(() => {
      fireEvent.change(input, { target: { value: "be" } })
    })

    expect(escape(input)).toBe(false)
    expect(input.value).toBe("")
    expect(isOpen()).toBe(true)
    expect(document.activeElement).toBe(input)

    expect(escape(input)).toBe(false)
    expect(isOpen()).toBe(false)
    expect(document.activeElement).not.toBe(input)
  })

  it("closes on the first Escape when the search is empty", () => {
    const input = open()
    escape(input)
    expect(isOpen()).toBe(false)
  })

  it("closes from the focused table list", () => {
    const input = open()
    act(() => {
      fireEvent.keyDown(input, { key: "ArrowDown", code: "ArrowDown" })
    })
    const list = getHook("table-selector-dropdown")
    expect(list.contains(document.activeElement)).toBe(true)
    escape(document.activeElement!)
    expect(isOpen()).toBe(false)
  })
})
