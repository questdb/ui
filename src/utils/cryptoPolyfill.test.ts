// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest"

const nativeRandomUUID = Object.getOwnPropertyDescriptor(
  window.crypto,
  "randomUUID",
)

afterEach(() => {
  if (nativeRandomUUID) {
    Object.defineProperty(window.crypto, "randomUUID", nativeRandomUUID)
  }
  vi.resetModules()
})

describe("crypto.randomUUID fallback", () => {
  it("generates version 4 UUIDs where the browser has no randomUUID", async () => {
    // Given
    Object.defineProperty(window.crypto, "randomUUID", {
      configurable: true,
      writable: true,
      value: undefined,
    })

    // When
    await import("./cryptoPolyfill")
    const first = window.crypto.randomUUID()
    const second = window.crypto.randomUUID()

    // Then
    expect(first).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
    expect(second).not.toBe(first)
  })

  it("keeps the browser's randomUUID", async () => {
    // Given
    const randomUUID = vi.fn(
      () => "00000000-0000-4000-8000-000000000000" as const,
    )
    Object.defineProperty(window.crypto, "randomUUID", {
      configurable: true,
      writable: true,
      value: randomUUID,
    })

    // When
    await import("./cryptoPolyfill")

    // Then
    expect(
      Object.getOwnPropertyDescriptor(window.crypto, "randomUUID")?.value,
    ).toBe(randomUUID)
  })
})
