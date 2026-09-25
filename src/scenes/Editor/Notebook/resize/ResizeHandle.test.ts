import { describe, expect, it } from "vitest"
import { resizeHeightForKey } from "./ResizeHandle"

describe("resizeHeightForKey", () => {
  it("resizes by arrow-key steps and clamps to separator bounds", () => {
    expect(resizeHeightForKey("ArrowUp", 100, 72, 200)).toBe(90)
    expect(resizeHeightForKey("ArrowDown", 100, 72, 200)).toBe(110)
    expect(resizeHeightForKey("ArrowUp", 75, 72, 200)).toBe(72)
    expect(resizeHeightForKey("ArrowDown", 195, 72, 200)).toBe(200)
  })

  it("supports larger Shift steps and Home/End bounds", () => {
    expect(resizeHeightForKey("ArrowDown", 100, 72, 200, true)).toBe(150)
    expect(resizeHeightForKey("Home", 150, 72, 200)).toBe(72)
    expect(resizeHeightForKey("End", 100, 72, 200)).toBe(200)
    expect(resizeHeightForKey("Enter", 100, 72, 200)).toBeNull()
  })
})
