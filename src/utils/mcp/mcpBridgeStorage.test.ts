import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  clearPendingPair,
  markPendingPairConsented,
  readPendingPair,
  readPermissions,
  writePendingPair,
  writePermissions,
} from "./mcpBridgeStorage"
import { DEFAULT_GRANTED, type Permissions } from "../tools/permissions"

const makeStubStorage = () => {
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
const PERMISSIONS_KEY = "mcp:permissions"

beforeEach(() => {
  ;(globalThis as { sessionStorage?: unknown }).sessionStorage =
    makeStubSessionStorage()
  ;(globalThis as { localStorage?: unknown }).localStorage = makeStubStorage()
})

afterEach(() => {
  delete (globalThis as { sessionStorage?: unknown }).sessionStorage
  delete (globalThis as { localStorage?: unknown }).localStorage
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

describe("mcpBridgeStorage permissions", () => {
  it("readPermissions returns DEFAULT_GRANTED when nothing is stored", () => {
    // Given an empty localStorage
    // When permissions are read
    // Then the granted default is returned
    expect(readPermissions()).toEqual(DEFAULT_GRANTED)
  })

  it("write + read round-trips a valid permissions object", () => {
    // Given a fully granted permissions object
    const perms: Permissions = {
      grantSchemaAccess: true,
      read: true,
      write: true,
    }
    // When written and read back
    writePermissions(perms)
    // Then the same object is returned
    expect(readPermissions()).toEqual(perms)
  })

  it("readPermissions returns DEFAULT_GRANTED on corrupt JSON", () => {
    // Given a corrupt stored value
    localStorage.setItem(PERMISSIONS_KEY, "{not json")
    // When permissions are read
    // Then the granted default is returned
    expect(readPermissions()).toEqual(DEFAULT_GRANTED)
  })

  it("readPermissions returns DEFAULT_GRANTED when a key is missing", () => {
    // Given a stored object missing the write field
    localStorage.setItem(
      PERMISSIONS_KEY,
      JSON.stringify({ grantSchemaAccess: true, read: true }),
    )
    // When permissions are read
    // Then the granted default is returned
    expect(readPermissions()).toEqual(DEFAULT_GRANTED)
  })

  it("readPermissions returns DEFAULT_GRANTED when a field is non-boolean", () => {
    // Given a stored object with a non-boolean field
    localStorage.setItem(
      PERMISSIONS_KEY,
      JSON.stringify({ grantSchemaAccess: true, read: "yes", write: false }),
    )
    // When permissions are read
    // Then the granted default is returned
    expect(readPermissions()).toEqual(DEFAULT_GRANTED)
  })

  it("readPermissions re-cascades a hand-edited impossible triple", () => {
    // Given a hand-edited triple where write is on but read/schema are off
    localStorage.setItem(
      PERMISSIONS_KEY,
      JSON.stringify({ grantSchemaAccess: false, read: false, write: true }),
    )
    // When permissions are read
    // Then the cascade is re-applied and every scope is granted
    expect(readPermissions()).toEqual({
      grantSchemaAccess: true,
      read: true,
      write: true,
    })
  })

  it("readPermissions re-cascades a hand-edited read-without-schema triple", () => {
    // Given a hand-edited triple where read is on but schema is off
    localStorage.setItem(
      PERMISSIONS_KEY,
      JSON.stringify({ grantSchemaAccess: false, read: true, write: false }),
    )
    // When permissions are read
    // Then schema is forced on and write stays off
    expect(readPermissions()).toEqual({
      grantSchemaAccess: true,
      read: true,
      write: false,
    })
  })
})
