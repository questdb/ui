import { describe, expect, it } from "vitest"
import { isOwnActivationKey } from "./keyboard"

const row = { id: "row" } as unknown as EventTarget
const nestedButton = { id: "button" } as unknown as EventTarget

const keyEvent = (key: string, target: EventTarget) =>
  ({ key, target, currentTarget: row }) as unknown as Parameters<
    typeof isOwnActivationKey
  >[0]

describe("isOwnActivationKey", () => {
  it("activates on Enter and Space pressed on the row itself", () => {
    expect(isOwnActivationKey(keyEvent("Enter", row))).toBe(true)
    expect(isOwnActivationKey(keyEvent(" ", row))).toBe(true)
  })

  it("ignores Enter and Space bubbling up from a nested button", () => {
    expect(isOwnActivationKey(keyEvent("Enter", nestedButton))).toBe(false)
    expect(isOwnActivationKey(keyEvent(" ", nestedButton))).toBe(false)
  })

  it("ignores other keys", () => {
    expect(isOwnActivationKey(keyEvent("ArrowUp", row))).toBe(false)
    expect(isOwnActivationKey(keyEvent("Tab", row))).toBe(false)
    expect(isOwnActivationKey(keyEvent("Escape", row))).toBe(false)
  })
})
