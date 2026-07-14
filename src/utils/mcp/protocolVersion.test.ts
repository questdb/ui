import { describe, expect, it } from "vitest"
import {
  EXPECTED_BRIDGE_VERSION,
  isBridgeVersionMismatch,
} from "./protocolVersion"

// Derive drifts from the expected version so these stay correct across bumps.
const [major, minor, patch] = EXPECTED_BRIDGE_VERSION.split(".").map(Number)
const bumped = (index: number): string => {
  const parts = [major, minor, patch]
  parts[index] += 1
  return parts.join(".")
}

describe("isBridgeVersionMismatch", () => {
  it("treats the exact expected version as a match", () => {
    // Given the bridge reports the expected version
    // When compared
    // Then it is not a mismatch
    expect(isBridgeVersionMismatch(EXPECTED_BRIDGE_VERSION)).toBe(false)
  })

  it("ignores pre-release / build suffixes on an otherwise-equal version", () => {
    // Given a version equal in major.minor.patch but with a suffix
    // When compared
    // Then it is not a mismatch
    expect(isBridgeVersionMismatch(`${EXPECTED_BRIDGE_VERSION}-beta.1`)).toBe(
      false,
    )
  })

  it("flags a patch drift", () => {
    // Given a bridge one patch ahead of expected
    // When compared
    // Then it is a mismatch
    expect(isBridgeVersionMismatch(bumped(2))).toBe(true)
  })

  it("flags a minor drift", () => {
    // Given a bridge one minor ahead of expected
    // When compared
    // Then it is a mismatch
    expect(isBridgeVersionMismatch(bumped(1))).toBe(true)
  })

  it("flags a major drift", () => {
    // Given a bridge one major ahead of expected
    // When compared
    // Then it is a mismatch
    expect(isBridgeVersionMismatch(bumped(0))).toBe(true)
  })

  it("does not flag an unparseable version (fails safe to no warning)", () => {
    // Given a malformed version string
    // When compared
    // Then it is not treated as a mismatch
    expect(isBridgeVersionMismatch("not-a-version")).toBe(false)
  })
})
