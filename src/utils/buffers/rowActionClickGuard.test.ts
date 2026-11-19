import { beforeEach, describe, expect, it } from "vitest"
import {
  acceptRowActionClick,
  ROW_ACTION_CLICK_WINDOW_MS,
  resetRowActionClickGuard,
} from "./rowActionClickGuard"

describe("acceptRowActionClick", () => {
  beforeEach(() => resetRowActionClickGuard())

  it("accepts the first click", () => {
    expect(acceptRowActionClick(1_000)).toBe(true)
  })

  it("rejects a second click inside the window (double-click)", () => {
    acceptRowActionClick(1_000)
    expect(acceptRowActionClick(1_000 + 150)).toBe(false)
    expect(acceptRowActionClick(1_000 + ROW_ACTION_CLICK_WINDOW_MS - 1)).toBe(
      false,
    )
  })

  it("accepts again once the window has passed", () => {
    acceptRowActionClick(1_000)
    expect(acceptRowActionClick(1_000 + ROW_ACTION_CLICK_WINDOW_MS)).toBe(true)
  })

  it("does not extend the window on a rejected click", () => {
    acceptRowActionClick(1_000)
    acceptRowActionClick(1_000 + 400)
    expect(acceptRowActionClick(1_000 + ROW_ACTION_CLICK_WINDOW_MS)).toBe(true)
  })
})
