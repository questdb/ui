import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { MCPBridgeClient } from "../../utils/mcp/MCPBridgeClient"
import type { MCPBridgeClientStatus } from "../../utils/mcp/MCPBridgeClient"
import { dispatchMCPTool } from "../../utils/mcp/dispatchMCPTool"
import { createNotebookFreshness } from "../../utils/notebooks/notebookFreshness"
import { mcpTools } from "../../utils/tools/tools"
import {
  EXPECTED_BRIDGE_VERSION,
  type BridgeVersionMismatch,
} from "../../utils/mcp/protocolVersion"
import type { ToolCallMessage } from "../../utils/mcp/types"
import {
  clearLegacyLocalStorage,
  clearPendingPair,
  markPendingPairConsented,
  readPendingPair,
  readPermissions,
  writePendingPair,
  writePermissions,
} from "../../utils/mcp/mcpBridgeStorage"
import {
  DEFAULT_GRANTED,
  normalizePermissions,
  type Permissions,
} from "../../utils/tools/permissions"
import { consumePendingPairFromUrl } from "../../utils/mcp/consumePendingPair"
import { QuestContext } from "../QuestProvider"
import { on as onUserAction } from "../../utils/notebooks/notebookAIBridge"
import type { ToolDefinition } from "../../utils/ai/types"
import {
  applyUserActionToDigest,
  createEmptyDigest,
} from "../AIConversationProvider/userActionDigest"
import type { UserActionDigest } from "../AIConversationProvider/types"
import { useBridgeToolRunner } from "./useBridgeToolRunner"
import { PairingConsentModal } from "./PairingConsentModal"

export type MCPBridgeContextValue = {
  status: MCPBridgeClientStatus
  latencyMs: number | null
  lastError: string | null
  retryAttempt: number
  versionMismatch: BridgeVersionMismatch | null
  url: string | null
  token: string | null
  connect: (url: string, token: string) => void
  disconnect: () => void
  permissions: Permissions
  setPermissions: (next: Permissions) => void
}

const defaultContext: MCPBridgeContextValue = {
  status: "disconnected",
  latencyMs: null,
  lastError: null,
  retryAttempt: 0,
  versionMismatch: null,
  url: null,
  token: null,
  connect: () => undefined,
  disconnect: () => undefined,
  permissions: DEFAULT_GRANTED,
  setPermissions: () => undefined,
}

const MCPBridgeContext = createContext<MCPBridgeContextValue>(defaultContext)

export const useMCPBridge = () => useContext(MCPBridgeContext)

// Sent in `hello` so the bridge can detect drift against its bundled
// tool list (Codex caches the initial tools/list and never refetches).
const toWireSchema = (t: ToolDefinition) => ({
  name: t.name,
  description: t.description ?? "",
  inputSchema: t.inputSchema as Record<string, unknown>,
})
const buildToolListForHello = () => mcpTools.map(toWireSchema)

const consoleOrigin =
  typeof window !== "undefined" ? window.location.origin : "unknown"

const CONSENT_SUCCESS_AUTOCLOSE_MS = 3_000

export const MCPBridgeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { quest } = useContext(QuestContext)
  const [url, setUrl] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [status, setStatus] = useState<MCPBridgeClientStatus>("disconnected")
  const [latencyMs, setLatencyMs] = useState<number | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)
  const [versionMismatch, setVersionMismatch] =
    useState<BridgeVersionMismatch | null>(null)
  const [permissions, setPermissionsState] = useState<Permissions>(() =>
    readPermissions(),
  )
  const permissionsRef = useRef<Permissions>(permissions)
  permissionsRef.current = permissions
  const permissionsDirtyRef = useRef<boolean>(false)
  const [retryAttempt, setRetryAttempt] = useState(0)
  const [pendingConsent, setPendingConsent] = useState<{
    url: string
    token: string
  } | null>(null)
  const [consentInFlight, setConsentInFlight] = useState(false)
  const [consentSucceeded, setConsentSucceeded] = useState(false)
  // Bumped on every Connect click so "Try again" re-runs the construction
  // effect even when {url,token} are unchanged; otherwise a wedged client
  // (consecutiveFailedAttempts pinned at the cap) is never rebuilt.
  const [connectAttempt, setConnectAttempt] = useState(0)

  const freshnessRef = useRef(createNotebookFreshness())

  const digestRef = useRef<UserActionDigest>(createEmptyDigest())
  const getDigest = useCallback(() => digestRef.current, [])
  // Snapshot-and-reset so the same user actions aren't re-emitted across
  // successive tool results.
  const consumeDigest = useCallback(() => {
    const snapshot = digestRef.current
    digestRef.current = createEmptyDigest()
    return snapshot
  }, [])

  const { modelToolsClient, metaToolContext } = useBridgeToolRunner(
    getDigest,
    consumeDigest,
  )

  const validateSql = useCallback(
    (sql: string) => quest.validateQuery(sql),
    [quest],
  )

  // Refs let the dispatcher read live values outside React's render flow.
  const permissionsRefs = useMemo(
    () => ({
      get: () => permissionsRef.current,
      consumeDirty: (): boolean => {
        const wasDirty = permissionsDirtyRef.current
        permissionsDirtyRef.current = false
        return wasDirty
      },
    }),
    [],
  )

  const dispatchCtxRef = useRef({
    modelToolsClient,
    freshness: freshnessRef.current,
    metaToolContext,
    permissions: permissionsRefs,
    validateSql,
  })
  dispatchCtxRef.current = {
    modelToolsClient,
    freshness: freshnessRef.current,
    metaToolContext,
    permissions: permissionsRefs,
    validateSql,
  }

  const inflightAbortersRef = useRef(new Map<string, AbortController>())

  // Distinguishes a revocation-driven abort from other reasons so the
  // toolCall handler sends an explicit error back to the bridge instead
  // of silently letting the agent time out.
  const PERMISSIONS_REVOKED_REASON = "permissions_revoked"

  const clientRef = useRef<MCPBridgeClient | null>(null)

  useEffect(() => {
    const cleanupUserActionListener = onUserAction("user-action", (evt) => {
      digestRef.current = applyUserActionToDigest(digestRef.current, evt)
    })
    return () => {
      cleanupUserActionListener()
    }
  }, [])

  useEffect(() => {
    if (!url || !token) return
    digestRef.current = createEmptyDigest()
    freshnessRef.current.reset()
    const client = new MCPBridgeClient({
      url,
      token,
      tools: buildToolListForHello(),
      consoleOrigin,
      permissions: permissionsRef.current,
    })
    clientRef.current = client

    const offStatus = client.on("status", (s) => setStatus(s))
    const offLatency = client.on("latency", (ms) => setLatencyMs(ms))
    const offError = client.on("error", (err) => setLastError(err.message))
    const offRetry = client.on("retryAttempt", (n) => setRetryAttempt(n))
    const offVersionMismatch = client.on("versionMismatch", (m) =>
      setVersionMismatch(m),
    )
    const offHelloAck = client.on("helloAck", () => {
      // Promote pending → consented so a same-tab refresh silently restores.
      markPendingPairConsented()
      setLastError(null)
    })

    const offToolCall = client.on("toolCall", (call: ToolCallMessage) => {
      const aborter = new AbortController()
      inflightAbortersRef.current.set(call.requestId, aborter)
      const deadlineTimer =
        typeof call.deadlineMs === "number" && call.deadlineMs > 0
          ? window.setTimeout(
              () => aborter.abort("deadline_exceeded"),
              call.deadlineMs,
            )
          : null
      const sendRevokedErrorIfNeeded = (): boolean => {
        if (!aborter.signal.aborted) return false
        if (aborter.signal.reason === PERMISSIONS_REVOKED_REASON) {
          client.sendToolResult({
            v: EXPECTED_BRIDGE_VERSION,
            type: "tool_result",
            requestId: call.requestId,
            content: [
              {
                type: "text",
                text: "PERMISSION_REVOKED: the user revoked permissions mid-call. Re-check current permissions before retrying.",
              },
            ],
            isError: true,
          })
        }
        return true
      }
      void (async () => {
        try {
          const result = await dispatchMCPTool(call, {
            ...dispatchCtxRef.current,
            signal: aborter.signal,
          })
          if (sendRevokedErrorIfNeeded()) return
          client.sendToolResult({
            v: EXPECTED_BRIDGE_VERSION,
            type: "tool_result",
            requestId: call.requestId,
            content: result.content,
            isError: result.isError ?? false,
          })
        } catch (err) {
          if (sendRevokedErrorIfNeeded()) return
          const message =
            err instanceof Error ? err.message : "tool dispatch failed"
          client.sendToolResult({
            v: EXPECTED_BRIDGE_VERSION,
            type: "tool_result",
            requestId: call.requestId,
            content: [{ type: "text", text: `dispatch_error: ${message}` }],
            isError: true,
          })
        } finally {
          if (deadlineTimer !== null) window.clearTimeout(deadlineTimer)
          inflightAbortersRef.current.delete(call.requestId)
        }
      })()
    })

    const offCancel = client.on("cancel", (msg) => {
      const aborter = inflightAbortersRef.current.get(msg.requestId)
      if (aborter) aborter.abort()
    })

    client.connect()

    return () => {
      offStatus()
      offLatency()
      offError()
      offRetry()
      offVersionMismatch()
      offHelloAck()
      offToolCall()
      offCancel()
      for (const a of Array.from(inflightAbortersRef.current.values())) {
        a.abort()
      }
      inflightAbortersRef.current.clear()
      client.disconnect()
      if (clientRef.current === client) clientRef.current = null
    }
  }, [url, token, connectAttempt])

  const connect = useCallback((nextUrl: string, nextToken: string) => {
    setRetryAttempt(0)
    setLastError(null)
    setVersionMismatch(null)
    setConnectAttempt((n) => n + 1)
    setUrl(nextUrl)
    setToken(nextToken)
    writePendingPair({
      url: nextUrl,
      token: nextToken,
      receivedAt: Date.now(),
    })
  }, [])

  const setPermissions = useCallback((nextRaw: Permissions) => {
    const next = normalizePermissions(nextRaw)
    const prev = permissionsRef.current
    const isDowngrade =
      (prev.grantSchemaAccess && !next.grantSchemaAccess) ||
      (prev.read && !next.read) ||
      (prev.write && !next.write)
    writePermissions(next)
    permissionsDirtyRef.current = true
    setPermissionsState(next)
    clientRef.current?.setPermissions(next)
    // Calls already past the dispatcher gate keep running; abort them so a
    // revoked write doesn't complete and feed a stale success to the agent.
    if (isDowngrade) {
      for (const aborter of Array.from(inflightAbortersRef.current.values())) {
        aborter.abort(PERMISSIONS_REVOKED_REASON)
      }
    }
  }, [])

  const disconnect = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.disconnect("user_disconnect")
    }
    clearPendingPair()
    setUrl(null)
    setToken(null)
    setStatus("disconnected")
    setLatencyMs(null)
    setLastError(null)
    setRetryAttempt(0)
    setVersionMismatch(null)
    digestRef.current = createEmptyDigest()
    freshnessRef.current.reset()
  }, [])

  useEffect(() => {
    clearLegacyLocalStorage()

    if (typeof window !== "undefined") {
      consumePendingPairFromUrl()
    }
    const pair = readPendingPair()
    if (!pair) return
    if (pair.consented) {
      setConnectAttempt((n) => n + 1)
      setUrl(pair.url)
      setToken(pair.token)
    } else {
      setPendingConsent({ url: pair.url, token: pair.token })
    }
  }, [])

  // Distinguishes the initial "disconnected" (before Connect commits)
  // from the terminal "gave up" disconnected.
  const attemptSawActiveRef = useRef(false)

  useEffect(() => {
    if (!pendingConsent || !consentInFlight) return
    if (status === "connected") {
      attemptSawActiveRef.current = false
      setConsentInFlight(false)
      setConsentSucceeded(true)
      markPendingPairConsented()
    } else if (status === "connecting" || status === "reconnecting") {
      attemptSawActiveRef.current = true
    } else if (status === "disconnected" && attemptSawActiveRef.current) {
      attemptSawActiveRef.current = false
      setConsentInFlight(false)
    }
  }, [status, pendingConsent, consentInFlight])

  // After give-up against a dead bridge, drop a consented pair so a refresh
  // doesn't restart an infinite-retry loop. Pre-consent pairs stay — the
  // modal's "Try again" needs them.
  useEffect(() => {
    if (status !== "disconnected") return
    if (!url || !token) return
    if (!lastError) return
    const stored = readPendingPair()
    if (stored?.consented) clearPendingPair()
  }, [status, url, token, lastError])

  // Don't flip consentSucceeded inside the timer: React 17 doesn't batch
  // setStates in setTimeout, and Radix keeps the modal mounted during its
  // 0.25s exit animation, so a flip would briefly swap success → default.
  // A minor mismatch connects fine but must keep the modal open so the user
  // actually reads the upgrade command — never auto-close past it.
  useEffect(() => {
    if (!consentSucceeded || versionMismatch === "minor") return
    const t = setTimeout(() => {
      setPendingConsent(null)
    }, CONSENT_SUCCESS_AUTOCLOSE_MS)
    return () => clearTimeout(t)
  }, [consentSucceeded, versionMismatch])

  const acceptPendingConsent = useCallback(
    (committedPermissions: Permissions) => {
      if (!pendingConsent || consentInFlight) return
      // Order matters: the about-to-be-constructed client reads
      // permissionsRef.current in its initial hello.
      setPermissions(committedPermissions)
      attemptSawActiveRef.current = false
      setConsentInFlight(true)
      setConsentSucceeded(false)
      setLastError(null)
      setRetryAttempt(0)
      setVersionMismatch(null)
      setConnectAttempt((n) => n + 1)
      setUrl(pendingConsent.url)
      setToken(pendingConsent.token)
    },
    [pendingConsent, consentInFlight, setPermissions],
  )

  const declinePendingConsent = useCallback(() => {
    // In the success state, Dismiss should NOT disconnect — the user
    // just confirmed connection.
    if (consentSucceeded) {
      setPendingConsent(null)
      setConsentSucceeded(false)
      return
    }
    setPendingConsent(null)
    setConsentInFlight(false)
    if (clientRef.current) {
      clientRef.current.disconnect("user_disconnect")
      clientRef.current = null
    }
    setUrl(null)
    setToken(null)
    setRetryAttempt(0)
    setLastError(null)
    setVersionMismatch(null)
    clearPendingPair()
  }, [consentSucceeded])

  const value = useMemo<MCPBridgeContextValue>(
    () => ({
      status,
      latencyMs,
      lastError,
      retryAttempt,
      versionMismatch,
      url,
      token,
      connect,
      disconnect,
      permissions,
      setPermissions,
    }),
    [
      status,
      latencyMs,
      lastError,
      retryAttempt,
      versionMismatch,
      url,
      token,
      connect,
      disconnect,
      permissions,
      setPermissions,
    ],
  )

  return (
    <MCPBridgeContext.Provider value={value}>
      {children}
      <PairingConsentModal
        pending={pendingConsent}
        isConnecting={consentInFlight}
        succeeded={consentSucceeded}
        retryAttempt={retryAttempt}
        error={consentInFlight ? null : lastError}
        versionMismatch={versionMismatch}
        permissions={permissions}
        onConnect={acceptPendingConsent}
        onCancel={declinePendingConsent}
      />
    </MCPBridgeContext.Provider>
  )
}
