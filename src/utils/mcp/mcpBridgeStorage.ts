// sessionStorage (not localStorage) for the pair: credentials must NOT
// survive tab close or browser sync. Permissions (booleans, not creds)
// live in localStorage under "mcp:permissions".

import {
  DEFAULT_GRANTED,
  normalizePermissions,
  type Permissions,
} from "../tools/permissions"

const KEY = "mcpBridgePendingPair"
const PERMISSIONS_KEY = "mcp:permissions"

export type StoredPendingPair = {
  url: string
  token: string
  receivedAt: number
  // `true` once helloAck arrives after a user-confirmed connect.
  // Pre-consent records get re-prompted; consented records auto-restore.
  consented?: boolean
}

const safeParsePair = (raw: string | null): StoredPendingPair | null => {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as Record<string, unknown>).url === "string" &&
      typeof (parsed as Record<string, unknown>).token === "string"
    ) {
      return parsed as StoredPendingPair
    }
  } catch {
    // Stale / corrupt — fall through to null.
  }
  return null
}

export const readPendingPair = (): StoredPendingPair | null => {
  if (typeof sessionStorage === "undefined") return null
  return safeParsePair(sessionStorage.getItem(KEY))
}

export const writePendingPair = (pair: StoredPendingPair): void => {
  if (typeof sessionStorage === "undefined") return
  sessionStorage.setItem(KEY, JSON.stringify(pair))
}

export const clearPendingPair = (): void => {
  if (typeof sessionStorage === "undefined") return
  sessionStorage.removeItem(KEY)
}

export const markPendingPairConsented = (): void => {
  if (typeof sessionStorage === "undefined") return
  const pair = safeParsePair(sessionStorage.getItem(KEY))
  if (!pair) return
  if (pair.consented) return
  sessionStorage.setItem(KEY, JSON.stringify({ ...pair, consented: true }))
}

// Migration cleanup: very early versions wrote pair creds to localStorage.
export const clearLegacyLocalStorage = (): void => {
  if (typeof localStorage === "undefined") return
  localStorage.removeItem("mcpBridge")
}

// No clearPermissions on purpose — disconnect is not a reason to
// forget the user's policy preference.
const safeParsePermissions = (raw: string | null): Permissions | null => {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as Record<string, unknown>).grantSchemaAccess ===
        "boolean" &&
      typeof (parsed as Record<string, unknown>).read === "boolean" &&
      typeof (parsed as Record<string, unknown>).write === "boolean"
    ) {
      // Re-apply the cascade in case the stored value was hand-edited.
      return normalizePermissions(parsed as Permissions)
    }
  } catch {
    // Stale / corrupt — fall through to null.
  }
  return null
}

export const readPermissions = (): Permissions => {
  if (typeof localStorage === "undefined") return DEFAULT_GRANTED
  return (
    safeParsePermissions(localStorage.getItem(PERMISSIONS_KEY)) ??
    DEFAULT_GRANTED
  )
}

export const writePermissions = (perms: Permissions): void => {
  if (typeof localStorage === "undefined") return
  localStorage.setItem(PERMISSIONS_KEY, JSON.stringify(perms))
}
