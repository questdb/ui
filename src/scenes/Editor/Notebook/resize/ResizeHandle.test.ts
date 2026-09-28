import { describe, expect, it } from "vitest"
import { isResizeKey, resizeHeightForKey } from "./ResizeHandle"

describe("resizeHeightForKey", () => {
  it("resizes by arrow-key steps and clamps to separator bounds", () => {
    // Given a separator bounded between 72 and 200
    const min = 72
    const max = 200

    // When arrow keys move the height near and past the bounds
    const up = resizeHeightForKey("ArrowUp", 100, min, max)
    const down = resizeHeightForKey("ArrowDown", 100, min, max)
    const upAtFloor = resizeHeightForKey("ArrowUp", 75, min, max)
    const downAtCeiling = resizeHeightForKey("ArrowDown", 195, min, max)

    // Then each step is 10px and clamps to the bounds
    expect(up).toBe(90)
    expect(down).toBe(110)
    expect(upAtFloor).toBe(72)
    expect(downAtCeiling).toBe(200)
  })

  it("supports larger Shift steps and Home/End bounds", () => {
    // Given a separator bounded between 72 and 200
    const min = 72
    const max = 200

    // When Shift+Arrow, Home, End and an unrelated key are pressed
    const shiftDown = resizeHeightForKey("ArrowDown", 100, min, max, true)
    const home = resizeHeightForKey("Home", 150, min, max)
    const end = resizeHeightForKey("End", 100, min, max)
    const unrelated = resizeHeightForKey("Enter", 100, min, max)

    // Then Shift steps by 50, Home/End jump to the bounds, other keys resolve to null
    expect(shiftDown).toBe(150)
    expect(home).toBe(72)
    expect(end).toBe(200)
    expect(unrelated).toBeNull()
  })
})

describe("isResizeKey", () => {
  it("names the keys whose release ends a keyboard resize", () => {
    // Given the keys a held resize can involve
    // When each is checked
    // Then only the height keys count, not the modifier held with them
    expect(["ArrowUp", "ArrowDown", "Home", "End"].map(isResizeKey)).toEqual([
      true,
      true,
      true,
      true,
    ])
    expect(isResizeKey("Shift")).toBe(false)
  })
})
