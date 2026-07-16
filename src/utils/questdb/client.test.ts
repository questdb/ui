import "../../test/stubBrowserGlobals"
import { afterEach, describe, expect, it, vi } from "vitest"
import { Client } from "./client"
import { Type } from "./types"

const response = (body: Record<string, unknown>): Response =>
  ({
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify(body)),
  }) as Response

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("Client queryRaw NOTICE timings", () => {
  it("adds fetch timing when the notice carries server timings", async () => {
    // Given a notice response with the regular query timing fields
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response({
          notice: "partition converted",
          timings: {
            compiler: 1,
            authentication: 2,
            count: 3,
            execute: 4,
          },
        }),
      ),
    )

    // When the raw query response is mapped
    const result = await new Client().queryRaw("SELECT 1")

    // Then NOTICE keeps its fields and receives the measured fetch timing
    expect(result.type).toBe(Type.NOTICE)
    if (result.type !== Type.NOTICE) throw new Error("expected notice")
    expect(result.timings).toMatchObject({
      compiler: 1,
      authentication: 2,
      count: 3,
      execute: 4,
    })
    expect(typeof result.timings?.fetch).toBe("number")
  })

  it("keeps timings absent when the notice has none", async () => {
    // Given a message-only notice response
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response({ notice: "hint applied" })),
    )

    // When the raw query response is mapped
    const result = await new Client().queryRaw("SELECT 1")

    // Then no partial timing object is invented
    expect(result.type).toBe(Type.NOTICE)
    expect(result).not.toHaveProperty("timings")
  })
})
