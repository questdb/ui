import { beforeEach, describe, expect, it } from "vitest"
import {
  acceptDeleteClick,
  DELETE_CLICK_WINDOW_MS,
  resetDeleteClickGuard,
} from "./deleteClickGuard"

describe("acceptDeleteClick", () => {
  beforeEach(() => resetDeleteClickGuard())

  it("accepts the first click", () => {
    expect(acceptDeleteClick(1_000)).toBe(true)
  })

  it("rejects a second click inside the window (double-click)", () => {
    acceptDeleteClick(1_000)
    expect(acceptDeleteClick(1_000 + 150)).toBe(false)
    expect(acceptDeleteClick(1_000 + DELETE_CLICK_WINDOW_MS - 1)).toBe(false)
  })

  it("accepts again once the window has passed", () => {
    acceptDeleteClick(1_000)
    expect(acceptDeleteClick(1_000 + DELETE_CLICK_WINDOW_MS)).toBe(true)
  })

  it("does not extend the window on a rejected click", () => {
    acceptDeleteClick(1_000)
    acceptDeleteClick(1_000 + 400)
    expect(acceptDeleteClick(1_000 + DELETE_CLICK_WINDOW_MS)).toBe(true)
  })
})
