import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { consumePendingPairFromUrl } from "./consumePendingPair"
import { readPendingPair } from "./mcpBridgeStorage"

const makeStub = () => {
  const store = new Map<string, string>()
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v)
    },
    removeItem: (k: string) => {
      store.delete(k)
    },
    clear: () => store.clear(),
  }
}

beforeEach(() => {
  ;(globalThis as { sessionStorage?: unknown }).sessionStorage = makeStub()
})

afterEach(() => {
  delete (globalThis as { sessionStorage?: unknown }).sessionStorage
})

const VALID_TOKEN = "abcdefghijklmnopqrst1234"

describe("consumePendingPairFromUrl", () => {
  it("returns no_params when mcp-pair is absent", () => {
    const result = consumePendingPairFromUrl(
      { search: "?other=foo", pathname: "/", hash: "" },
      { replaceState: () => undefined },
    )
    expect(result).toEqual({ kind: "no_params" })
  })

  it("rejects when mcp-ws or mcp-token missing", () => {
    expect(
      consumePendingPairFromUrl(
        { search: "?mcp-pair=1&mcp-token=t", pathname: "/", hash: "" },
        { replaceState: () => undefined },
      ),
    ).toEqual({ kind: "rejected", reason: "missing_field" })
    expect(
      consumePendingPairFromUrl(
        {
          search: "?mcp-pair=1&mcp-ws=ws://127.0.0.1:1",
          pathname: "/",
          hash: "",
        },
        { replaceState: () => undefined },
      ),
    ).toEqual({ kind: "rejected", reason: "missing_field" })
  })

  it("rejects non-localhost mcp-ws (CSRF guard)", () => {
    expect(
      consumePendingPairFromUrl(
        {
          search: `?mcp-pair=1&mcp-ws=ws://attacker.com:443&mcp-token=${VALID_TOKEN}`,
          pathname: "/",
          hash: "",
        },
        { replaceState: () => undefined },
      ),
    ).toEqual({ kind: "rejected", reason: "invalid_ws" })
  })

  it("rejects malformed tokens", () => {
    expect(
      consumePendingPairFromUrl(
        {
          search: "?mcp-pair=1&mcp-ws=ws://127.0.0.1:1234&mcp-token=short",
          pathname: "/",
          hash: "",
        },
        { replaceState: () => undefined },
      ),
    ).toEqual({ kind: "rejected", reason: "invalid_token" })
  })

  it("accepts ws://127.0.0.1, ws://localhost, ws://[::1] with port", () => {
    for (const host of ["127.0.0.1", "localhost", "[::1]"]) {
      const result = consumePendingPairFromUrl(
        {
          search: `?mcp-pair=1&mcp-ws=ws://${host}:9876&mcp-token=${VALID_TOKEN}`,
          pathname: "/",
          hash: "",
        },
        { replaceState: () => undefined },
      )
      expect(result).toEqual({ kind: "consumed" })
    }
  })

  it("persists pendingPair and scrubs the URL", () => {
    const replace = vi.fn()
    const result = consumePendingPairFromUrl(
      {
        search: `?mcp-pair=1&mcp-ws=ws://127.0.0.1:9876&mcp-token=${VALID_TOKEN}&keep=me`,
        pathname: "/console",
        hash: "#frag",
      },
      { replaceState: replace },
    )
    expect(result).toEqual({ kind: "consumed" })
    const stored = readPendingPair()
    expect(stored?.url).toBe("ws://127.0.0.1:9876")
    expect(stored?.token).toBe(VALID_TOKEN)
    expect(replace).toHaveBeenCalledOnce()
    expect(replace).toHaveBeenCalledWith(null, "", "/console?keep=me#frag")
  })

  it("keeps the agent name and workspace of an agent bridge and scrubs them from the URL", () => {
    // Given
    const replace = vi.fn()
    const agent = new URLSearchParams({
      "mcp-agent": "Claude Code",
      "mcp-agent-cwd": "/Users/me/.questdb/mcp-bridge/workspace",
    })

    // When
    consumePendingPairFromUrl(
      {
        search: `?mcp-pair=1&mcp-ws=ws://127.0.0.1:9876&mcp-token=${VALID_TOKEN}&${agent.toString()}`,
        pathname: "/",
        hash: "",
      },
      { replaceState: replace },
    )

    // Then
    expect(readPendingPair()?.agent).toEqual({
      label: "Claude Code",
      cwd: "/Users/me/.questdb/mcp-bridge/workspace",
    })
    expect(replace).toHaveBeenCalledWith(null, "", "/")
  })

  const consumeAgent = (agent: Record<string, string>) =>
    consumePendingPairFromUrl(
      {
        search: `?mcp-pair=1&mcp-ws=ws://127.0.0.1:9876&mcp-token=${VALID_TOKEN}&${new URLSearchParams(agent).toString()}`,
        pathname: "/",
        hash: "",
      },
      { replaceState: () => undefined },
    )

  it("cuts an overlong agent name instead of dropping the agent", () => {
    // When
    consumeAgent({ "mcp-agent": "x".repeat(129), "mcp-agent-cwd": "/tmp" })

    // Then
    expect(readPendingPair()?.agent).toEqual({
      label: `${"x".repeat(127)}…`,
      cwd: "/tmp",
    })
  })

  it("keeps a long workspace path up to the Linux path limit", () => {
    // Given
    const cwd = `/${"a".repeat(4095)}`

    // When
    consumeAgent({ "mcp-agent": "Claude Code", "mcp-agent-cwd": cwd })

    // Then
    expect(readPendingPair()?.agent?.cwd).toBe(cwd)
  })

  it("marks control and direction-override characters instead of showing them", () => {
    // When
    consumeAgent({
      "mcp-agent": "Claude\u202eedoC",
      "mcp-agent-cwd": "/tmp\nevil",
    })

    // Then
    expect(readPendingPair()?.agent).toEqual({
      label: "Claude\uFFFDedoC",
      cwd: "/tmp\uFFFDevil",
    })
  })

  it("treats a link with only one agent parameter as an agent bridge", () => {
    // When
    consumeAgent({ "mcp-agent-cwd": "/tmp" })

    // Then
    expect(readPendingPair()?.agent).toEqual({
      label: "Coding agent",
      cwd: "/tmp",
    })
  })
})
