import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  clearPendingPair,
  markPendingPairConsented,
  readPendingPair,
  writePendingPair,
} from "./mcpBridgeStorage"

const makeStubSessionStorage = () => {
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

const KEY = "mcpBridgePendingPair"

beforeEach(() => {
  ;(globalThis as { sessionStorage?: unknown }).sessionStorage =
    makeStubSessionStorage()
})

afterEach(() => {
  delete (globalThis as { sessionStorage?: unknown }).sessionStorage
})

const PAIR = { url: "ws://127.0.0.1:1234", token: "tok", receivedAt: 0 }

describe("mcpBridgeStorage", () => {
  it("readPendingPair returns null when nothing stored", () => {
    expect(readPendingPair()).toBeNull()
  })

  it("readPendingPair returns null on corrupt JSON", () => {
    sessionStorage.setItem(KEY, "{not json")
    expect(readPendingPair()).toBeNull()
  })

  it("readPendingPair returns null when shape is wrong", () => {
    sessionStorage.setItem(KEY, JSON.stringify({ notUrl: true }))
    expect(readPendingPair()).toBeNull()
  })

  it("write + read round-trip", () => {
    writePendingPair(PAIR)
    expect(readPendingPair()).toEqual(PAIR)
  })

  it("clearPendingPair removes the key", () => {
    writePendingPair(PAIR)
    clearPendingPair()
    expect(sessionStorage.getItem(KEY)).toBeNull()
    expect(readPendingPair()).toBeNull()
  })

  it("markPendingPairConsented promotes a pending pair without touching url/token/receivedAt", () => {
    writePendingPair(PAIR)
    markPendingPairConsented()
    expect(readPendingPair()).toEqual({ ...PAIR, consented: true })
  })

  it("markPendingPairConsented is a no-op when no pair is stored", () => {
    markPendingPairConsented()
    expect(readPendingPair()).toBeNull()
    expect(sessionStorage.getItem(KEY)).toBeNull()
  })

  it("markPendingPairConsented is idempotent", () => {
    writePendingPair(PAIR)
    markPendingPairConsented()
    markPendingPairConsented()
    expect(readPendingPair()).toEqual({ ...PAIR, consented: true })
  })

  it("consented pair survives a write+read round-trip with the flag intact", () => {
    writePendingPair({ ...PAIR, consented: true })
    expect(readPendingPair()).toEqual({ ...PAIR, consented: true })
  })

  it("consented flag from older record without the field defaults to undefined (not auto-consented)", () => {
    sessionStorage.setItem(
      KEY,
      JSON.stringify({ url: PAIR.url, token: PAIR.token, receivedAt: 0 }),
    )
    const stored = readPendingPair()
    expect(stored?.consented).toBeUndefined()
  })
})
