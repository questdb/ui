import React from "react"
import { act, create, type ReactTestRenderer } from "react-test-renderer"
import { afterEach, describe, expect, it, vi } from "vitest"
import { useGridKeyboardNav } from "./useGridKeyboardNav"
import { notificationFocusOrigins } from "../Toast/notificationFocus"

vi.mock("../Toast", () => ({ toast: { success: vi.fn() } }))

let renderer: ReactTestRenderer
let nav: ReturnType<typeof useGridKeyboardNav>
const Mount = ({
  rowCount = 10,
  colCount = 3,
}: {
  rowCount?: number
  colCount?: number
}) => {
  nav = useGridKeyboardNav(
    rowCount,
    colCount,
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
  const leaveForNotification = () => {
    const grid = { contains: () => false } as unknown as HTMLElement
    const notification = {} as HTMLElement
    const message = { closest: () => notification } as unknown as HTMLElement
    notificationFocusOrigins.set(notification, grid)
    act(() => nav.onCellClick(2, 1))
    act(() =>
      nav.onBlur({
        currentTarget: grid,
        relatedTarget: message,
      } as unknown as React.FocusEvent<HTMLElement>),
    )
    expect(nav.focusedCell).toBeNull()
    return { grid, message }
  }

  it("restores the selected coordinate and navigation when returning from its notification", () => {
    act(() => {
      renderer = create(<Mount />)
    })
    const { grid, message } = leaveForNotification()
    act(() =>
      nav.onFocus({
        target: grid,
        currentTarget: grid,
        relatedTarget: message,
      } as unknown as React.FocusEvent<HTMLElement>),
    )
    expect(nav.focusedCell).toEqual({ row: 2, col: 1 })
    act(() =>
      nav.onKeyDown({
        key: "ArrowDown",
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent),
    )
    expect(nav.focusedCell).toEqual({ row: 3, col: 1 })
  })

  it("clears both the active selection and the saved notification coordinate on reset", () => {
    act(() => {
      renderer = create(<Mount />)
    })
    const { grid, message } = leaveForNotification()
    act(() => nav.resetSelection())
    act(() =>
      nav.onFocus({
        target: grid,
        currentTarget: grid,
        relatedTarget: message,
      } as unknown as React.FocusEvent<HTMLElement>),
    )
    expect(nav.focusedCell).toBeNull()
    const preventDefault = vi.fn()
    act(() =>
      nav.onKeyDown({
        key: "c",
        ctrlKey: true,
        preventDefault,
      } as unknown as React.KeyboardEvent),
    )
    expect(preventDefault).not.toHaveBeenCalled()

    act(() => nav.onCellClick(2, 1))
    act(() => nav.resetSelection())
    expect(nav.focusedCell).toBeNull()
  })

  it.each<[number, number, { row: number; col: number } | null]>([
    [2, 1, { row: 1, col: 0 }],
    [0, 3, null],
    [10, 0, null],
  ])(
    "clamps notification-return focus to a changed %s by %s dataset",
    (rowCount, colCount, expected) => {
      act(() => {
        renderer = create(<Mount />)
      })
      const { grid, message } = leaveForNotification()
      act(() =>
        renderer.update(<Mount rowCount={rowCount} colCount={colCount} />),
      )
      act(() =>
        nav.onFocus({
          target: grid,
          currentTarget: grid,
          relatedTarget: message,
        } as unknown as React.FocusEvent<HTMLElement>),
      )
      expect(nav.focusedCell).toEqual(expected)
    },
  )

  it("does not restore the saved coordinate after focus leaves the notification elsewhere", () => {
    act(() => {
      renderer = create(<Mount />)
    })
    const { grid, message } = leaveForNotification()
    act(() =>
      nav.onFocus({
        target: grid,
        currentTarget: grid,
        relatedTarget: null,
      } as unknown as React.FocusEvent<HTMLElement>),
    )
    expect(nav.focusedCell).toBeNull()
    // The excursion snapshot was consumed, so later notification focus cannot
    // unexpectedly resurrect a selection that the user already left behind.
    act(() =>
      nav.onFocus({
        target: grid,
        currentTarget: grid,
        relatedTarget: message,
      } as unknown as React.FocusEvent<HTMLElement>),
    )
    expect(nav.focusedCell).toBeNull()
  })

  it.each([null])(
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

  it.each(["BUTTON", "MAIN"])(
    "clears the active cell when focus explicitly moves to %s",
    (tagName) => {
      act(() => {
        renderer = create(<Mount />)
      })
      act(() => nav.onCellClick(2, 1))
      act(() =>
        nav.onBlur({
          relatedTarget: { tagName },
          currentTarget: { contains: () => false },
        } as unknown as React.FocusEvent<HTMLElement>),
      )
      expect(nav.focusedCell).toBeNull()
    },
  )
})
