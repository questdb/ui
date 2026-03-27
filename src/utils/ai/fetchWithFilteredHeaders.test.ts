import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { createHeaderFilteredFetch } from "./fetchWithFilteredHeaders"

describe("createHeaderFilteredFetch", () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("ok"))
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  function getPassedHeaders(): Headers {
    const mock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    return (mock.mock.calls[0] as [string, RequestInit])[1].headers as Headers
  }

  it("passes allowed headers through", async () => {
    const fetch = createHeaderFilteredFetch(["content-type", "authorization"])

    await fetch("https://example.com", {
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer tok",
      },
    })

    const h = getPassedHeaders()
    expect(h.get("content-type")).toBe("application/json")
    expect(h.get("authorization")).toBe("Bearer tok")
  })

  it("blocks headers not in the allow list", async () => {
    const fetch = createHeaderFilteredFetch(["content-type"])

    await fetch("https://example.com", {
      headers: {
        "Content-Type": "application/json",
        "X-Custom": "secret",
        Authorization: "Bearer tok",
      },
    })

    const h = getPassedHeaders()
    expect(h.has("x-custom")).toBe(false)
    expect(h.has("authorization")).toBe(false)
  })

  it("does not add any extra headers", async () => {
    const fetch = createHeaderFilteredFetch(["content-type", "authorization"])

    await fetch("https://example.com", {
      headers: { "Content-Type": "application/json" },
    })

    const keys: string[] = []
    getPassedHeaders().forEach((_, k) => keys.push(k))
    expect(keys).toEqual(["content-type"])
  })
})
