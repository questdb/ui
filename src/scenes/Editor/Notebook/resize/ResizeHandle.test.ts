import { describe, expect, it } from "vitest"
import { resizeHeightForKey } from "./ResizeHandle"

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

  it("never grows a pane on a shrink key or shrinks it on a grow key", () => {
    // Given a separator bounded between 56 and 2400
    const min = 56
    const max = 2400

    // When the pane renders below the floor or above the ceiling
    const upBelowFloor = resizeHeightForKey("ArrowUp", 37, min, max)
    const homeBelowFloor = resizeHeightForKey("Home", 37, min, max)
    const downAboveCeiling = resizeHeightForKey("ArrowDown", 2500, min, max)
    const endAboveCeiling = resizeHeightForKey("End", 2500, min, max)

    // Then the height stays where it is instead of jumping to the bound
    expect(upBelowFloor).toBe(37)
    expect(homeBelowFloor).toBe(37)
    expect(downAboveCeiling).toBe(2500)
    expect(endAboveCeiling).toBe(2500)
  })
})
