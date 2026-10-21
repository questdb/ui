import { AuthPayload } from "../../modules/OAuth2/types"
import { AuthRefreshUnavailableError } from "../../modules/OAuth2/session"
import { authSessionState } from "../../modules/OAuth2/authSessionState"
import { TOKEN_REQUEST_TIMEOUT_MS } from "../../modules/OAuth2/utils"
import { eventBus } from "../../modules/EventBus"
import { EventType } from "../../modules/EventBus/types"
import { DeadlineExceededError, withDeadline } from "../withDeadline"

// Queries wait this long, not the network request. A late success may contain
// the only usable rotated refresh token and is retained until the hard limit.
export const REFRESH_WAIT_TIMEOUT_MS = TOKEN_REQUEST_TIMEOUT_MS
export const REFRESH_REQUEST_TIMEOUT_MS = 60_000
export const REFRESH_RETRY_DELAY_MS = 5_000
const MAX_RETRY_DELAY_MS = 30_000
const REFRESH_WINDOW_MS = 30_000
const MIN_SUCCESS_THROTTLE_MS = 5_000
const MAX_SUCCESS_THROTTLE_MS = 30_000

export type RefreshableAuthPayload = AuthPayload & {
  refresh_token: string
  expires_at: string
}

// Both signals are required: one marks late OAuth errors, the other cancels
// network work at the hard deadline/session change. Only an installed payload
// may be returned; a raw endpoint response is not a valid refreshed session.
export type RefreshTokenMethod = (
  deadlineSignal: AbortSignal,
  requestSignal: AbortSignal,
) => Promise<AuthPayload | undefined>

export const isRefreshable = (
  payload: AuthPayload | null,
): payload is RefreshableAuthPayload =>
  !!payload?.refresh_token &&
  payload.expires_at !== undefined &&
  Number.isFinite(new Date(payload.expires_at).getTime())

class TokenRefreshCoordinator {
  private pending: {
    softDeadline: Promise<void>
    hardDeadline: Promise<void>
    hardDeadlineAt: number
    sessionId: number
    cancel: () => void
    // Past the soft deadline: waiters were released and the failure reported,
    // but the request may still return a rotated refresh token.
    stalled: boolean
  } | null = null
  private retryPayload: AuthPayload | null = null
  private failures = 0
  private retryAfter = 0

  private resetBackoff(payload: AuthPayload | null) {
    this.retryPayload = payload
    this.failures = 0
    this.retryAfter = 0
  }

  syncSession() {
    if (
      this.pending &&
      this.pending.sessionId !== authSessionState.getSessionId()
    ) {
      this.pending.cancel()
      this.pending = null
    }
    const payload = authSessionState.getAuthPayload()
    if (this.retryPayload !== payload) this.resetBackoff(payload)
  }

  get softDeadline() {
    return this.pending?.softDeadline
  }

  get hardDeadline() {
    return this.pending?.hardDeadline
  }

  inBackoff() {
    return Date.now() < this.retryAfter
  }

  // A person pressing Retry skips the wait between failed renewals: it
  // protects the identity provider from background requests. The throttle
  // after a successful renewal still applies.
  allowRetry() {
    if (authSessionState.hasRefreshFailed()) this.retryAfter = 0
  }

  needsRefresh(payload: AuthPayload | null) {
    return (
      isRefreshable(payload) &&
      new Date(payload.expires_at).getTime() - Date.now() < REFRESH_WINDOW_MS &&
      Date.now() >= this.retryAfter
    )
  }

  canSendWithoutRefresh() {
    const payload = authSessionState.getAuthPayload()
    return (
      !payload ||
      (!this.pending &&
        !authSessionState.hasRefreshFailed() &&
        (!isRefreshable(payload) ||
          new Date(payload.expires_at).getTime() - Date.now() >=
            REFRESH_WINDOW_MS))
    )
  }

  private hasUnusableToken() {
    const payload = authSessionState.getAuthPayload()
    return (
      isRefreshable(payload) &&
      authSessionState.hasRefreshFailed() &&
      new Date(payload.expires_at).getTime() <= Date.now()
    )
  }

  // Never send a known-expired bearer after a transient refresh failure.
  // Keep the login intact: transport/5xx failures do not prove revocation.
  // Authoritative OAuth rejections are handled by AuthProvider.
  ensureUsableToken() {
    if (this.hasUnusableToken()) throw new AuthRefreshUnavailableError()
  }

  // A renewal that failed at its soft deadline holds the slot until its hard
  // deadline, so a request past the backoff cannot start another one, and
  // without a usable token it would fail at once. Returns that renewal for
  // such a request to wait for, and how long it may still take.
  stalledRenewal() {
    const slot = this.pending
    if (!slot?.stalled || this.inBackoff() || !this.hasUnusableToken())
      return undefined
    return {
      settled: slot.hardDeadline,
      remainingMs: Math.max(0, slot.hardDeadlineAt - Date.now()),
    }
  }

  start(
    originalPayload: RefreshableAuthPayload,
    refresh: RefreshTokenMethod | undefined,
  ) {
    if (this.pending || !refresh) return
    const sessionId = authSessionState.getSessionId()
    const deadline = new AbortController()
    const requestController = new AbortController()
    const expiry = new Date(originalPayload.expires_at).getTime()
    let failureReported = false
    const reportFailure = (error: unknown) => {
      if (
        failureReported ||
        authSessionState.getAuthPayload() !== originalPayload ||
        authSessionState.getSessionId() !== sessionId
      )
        return
      failureReported = true
      this.failures++
      const now = Date.now()
      const retryAfter =
        now +
        Math.min(
          REFRESH_RETRY_DELAY_MS * 2 ** (this.failures - 1),
          MAX_RETRY_DELAY_MS,
        )
      this.retryAfter = expiry > now ? Math.min(expiry, retryAfter) : retryAfter
      console.error("Failed to refresh the auth token", error)
      authSessionState.markRefreshFailed()
      eventBus.publish(EventType.MSG_AUTH_REFRESH_FAILED)
    }
    const request = Promise.resolve()
      .then(() => refresh(deadline.signal, requestController.signal))
      .then((payload) => {
        if (
          requestController.signal.aborted ||
          !payload ||
          !authSessionState.getAuthPayload() ||
          authSessionState.getSessionId() !== sessionId
        )
          return
        this.resetBackoff(authSessionState.getAuthPayload())
        const remaining = payload.expires_at
          ? new Date(payload.expires_at).getTime() - Date.now()
          : 0
        // A fast browser clock must not turn short apparent lifetimes into
        // refresh storms. Server-side 401 recovery bypasses this throttle.
        this.retryAfter =
          Date.now() +
          (remaining > 0
            ? Math.max(
                MIN_SUCCESS_THROTTLE_MS,
                Math.min(MAX_SUCCESS_THROTTLE_MS, remaining / 2),
              )
            : MAX_SUCCESS_THROTTLE_MS)
      })
      .catch(reportFailure)

    let hardTimer: ReturnType<typeof setTimeout>
    let cancel!: () => void
    const hardDeadlineAt = Date.now() + REFRESH_REQUEST_TIMEOUT_MS
    const hardLimit = new Promise<void>((resolve) => {
      cancel = () => {
        clearTimeout(hardTimer)
        deadline.abort()
        requestController.abort()
        resolve()
      }
      // Access-token expiry does not invalidate a rotating refresh. Keep its
      // response for the full network deadline, independently of query waits.
      // Abort before freeing the slot, even if body reading ignores abort.
      hardTimer = setTimeout(() => {
        reportFailure(new DeadlineExceededError())
        cancel()
        if (this.pending?.softDeadline === softDeadline) this.pending = null
      }, REFRESH_REQUEST_TIMEOUT_MS)
    })
    const hardDeadline = Promise.race([request, hardLimit])
    const softDeadline = withDeadline(
      hardDeadline,
      REFRESH_WAIT_TIMEOUT_MS,
      () => {
        deadline.abort()
        const slot = this.pending
        if (slot?.hardDeadline === hardDeadline) slot.stalled = true
      },
    ).catch(reportFailure)
    this.pending = {
      softDeadline,
      hardDeadline,
      hardDeadlineAt,
      sessionId,
      cancel,
      stalled: false,
    }
    void request.finally(() => {
      clearTimeout(hardTimer)
      if (this.pending?.softDeadline === softDeadline) this.pending = null
    })
  }
}

// All authenticated requests share refresh coordination for the tab's login.
export const tokenRefresh = new TokenRefreshCoordinator()
authSessionState.onEnd(() => tokenRefresh.syncSession())

export const awaitRefresh = (refresh: Promise<void>, signal: AbortSignal) => {
  if (signal.aborted)
    return Promise.reject(new DOMException("Aborted", "AbortError"))
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => reject(new DOMException("Aborted", "AbortError"))
    signal.addEventListener("abort", onAbort, { once: true })
    void refresh.then(
      () => {
        signal.removeEventListener("abort", onAbort)
        resolve()
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort)
        reject(error)
      },
    )
  })
}
