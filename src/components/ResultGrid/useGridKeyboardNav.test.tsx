import React from "react"
import { act, create, type ReactTestRenderer } from "react-test-renderer"
import { afterEach, describe, expect, it, vi } from "vitest"
import { useGridKeyboardNav } from "./useGridKeyboardNav"

vi.mock("../Toast", () => ({ toast: { success: vi.fn() } }))

let renderer: ReactTestRenderer
let nav: ReturnType<typeof useGridKeyboardNav>
const Mount = () => {
  nav = useGridKeyboardNav(
    10,
    3,
    () => 1,
    () => undefined,
    { current: null },
  )
  return null
}

afterEach(() => {
  act(() => renderer?.unmount())
})

describe("grid focus retention", () => {
  it.each([null, { tagName: "MAIN" }])(
    "retains its active cell when focus moves to %j",
    (relatedTarget) => {
      act(() => {
        renderer = create(<Mount />)
      })
      act(() => nav.onCellClick(2, 1))
      act(() =>
        nav.onBlur({
          relatedTarget,
          currentTarget: { contains: () => false },
        } as unknown as React.FocusEvent<HTMLElement>),
      )
      expect(nav.focusedCell).toEqual({ row: 2, col: 1 })
      act(() =>
        nav.onKeyDown({
          key: "ArrowDown",
          preventDefault: vi.fn(),
        } as unknown as React.KeyboardEvent<HTMLElement>),
      )
      expect(nav.focusedCell).toEqual({ row: 3, col: 1 })
    },
  )

  it("clears the active cell when moving to another interactive control", () => {
    act(() => {
      renderer = create(<Mount />)
    })
    act(() => nav.onCellClick(2, 1))
    act(() =>
      nav.onBlur({
        relatedTarget: { tagName: "BUTTON" },
        currentTarget: { contains: () => false },
      } as unknown as React.FocusEvent<HTMLElement>),
    )
    expect(nav.focusedCell).toBeNull()
  })
})
