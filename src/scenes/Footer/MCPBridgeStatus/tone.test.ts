import { describe, expect, it } from "vitest"
import { pillSuffix } from "./tone"

describe("pillSuffix", () => {
  it("calls the bridge outdated only when the bridge itself is warning-toned", () => {
    // When an agent is in error, the bridge is connected
    const agentError = pillSuffix(false, "connected")
    // When the bridge is a minor version behind
    const outdatedBridge = pillSuffix(false, "warning")

    // Then
    expect(agentError).toBeNull()
    expect(outdatedBridge).toBe("outdated")
  })

  it("mentions unread agent changes first", () => {
    expect(pillSuffix(true, "warning")).toBe("new changes")
    expect(pillSuffix(true, "connected")).toBe("new changes")
  })
})
