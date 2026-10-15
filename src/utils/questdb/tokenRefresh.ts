import { AuthPayload } from "../../modules/OAuth2/types"
import { AuthRefreshUnavailableError } from "../../modules/OAuth2/session"
import { ssoAuthState } from "../../modules/OAuth2/ssoAuthState"
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
    wait: Promise<void>
    completion: Promise<void>
    sessionId: number
    cancel: () => void
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
      this.pending.sessionId !== ssoAuthState.getSessionId()
    ) {
      this.pending.cancel()
      this.pending = null
    }
    const payload = ssoAuthState.getAuthPayload()
    if (this.retryPayload !== payload) this.resetBackoff(payload)
  }

  get wait() {
    return this.pending?.wait
  }

  get completion() {
    return this.pending?.completion
  }

  needsRefresh(payload: AuthPayload | null) {
    return (
      isRefreshable(payload) &&
      new Date(payload.expires_at).getTime() - Date.now() < REFRESH_WINDOW_MS &&
      Date.now() >= this.retryAfter
    )
  }

  // Never send a known-expired bearer after a transient refresh failure.
  // Keep the login intact: transport/5xx failures do not prove revocation.
  // Authoritative OAuth rejections are handled by AuthProvider.
  ensureUsableToken() {
    const payload = ssoAuthState.getAuthPayload()
    if (
      isRefreshable(payload) &&
      ssoAuthState.hasRefreshFailed() &&
      new Date(payload.expires_at).getTime() <= Date.now()
    ) {
      throw new AuthRefreshUnavailableError()
    }
  }

  start(
    originalSession: RefreshableAuthPayload,
    refresh: RefreshTokenMethod | undefined,
  ) {
    if (this.pending || !refresh) return
    const sessionId = ssoAuthState.getSessionId()
    const deadline = new AbortController()
    const requestController = new AbortController()
    const expiry = new Date(originalSession.expires_at).getTime()
    let failureReported = false
    const reportFailure = (error: unknown) => {
      if (
        failureReported ||
        ssoAuthState.getAuthPayload() !== originalSession ||
        ssoAuthState.getSessionId() !== sessionId
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
      ssoAuthState.markRefreshFailed()
      eventBus.publish(EventType.MSG_AUTH_REFRESH_FAILED)
    }
    const request = Promise.resolve()
      .then(() => refresh(deadline.signal, requestController.signal))
      .then((payload) => {
        if (
          requestController.signal.aborted ||
          !payload ||
          !ssoAuthState.getAuthPayload() ||
          ssoAuthState.getSessionId() !== sessionId
        )
          return
        this.resetBackoff(ssoAuthState.getAuthPayload())
        const remaining = payload.expires_at
          ? new Date(payload.expires_at).getTime() - Date.now()
          : 0
        // A fast browser clock must not turn short apparent lifetimes into
        // refresh storms. Server-side 401 recovery bypasses this throttle.
        this.retryAfter =
          Date.now() +
          (remaining > 0
            ? Math.max(
                REFRESH_RETRY_DELAY_MS,
                Math.min(MAX_SUCCESS_THROTTLE_MS, remaining / 2),
              )
            : MAX_SUCCESS_THROTTLE_MS)
      })
      .catch(reportFailure)

    let hardTimer: ReturnType<typeof setTimeout>
    let cancel!: () => void
    const hardDeadline = new Promise<void>((resolve) => {
      cancel = () => {
        clearTimeout(hardTimer)
        deadline.abort()
        requestController.abort()
        resolve()
      }
      // Retain a timed-out slot only until expiry (or 60 seconds), with at
      // least the ordinary wait deadline. Abort before freeing the slot; the
      // provider must reject installation even if body reading ignores abort.
      hardTimer = setTimeout(
        () => {
          reportFailure(new DeadlineExceededError())
          cancel()
          if (this.pending?.wait === wait) this.pending = null
        },
        Math.max(
          REFRESH_WAIT_TIMEOUT_MS,
          Math.min(REFRESH_REQUEST_TIMEOUT_MS, expiry - Date.now()),
        ),
      )
    })
    const completion = Promise.race([request, hardDeadline])
    const wait = withDeadline(completion, REFRESH_WAIT_TIMEOUT_MS, () =>
      deadline.abort(),
    ).catch(reportFailure)
    this.pending = { wait, completion, sessionId, cancel }
    void request.finally(() => {
      clearTimeout(hardTimer)
      if (this.pending?.wait === wait) this.pending = null
    })
  }
}

// All SQL consumers share refresh coordination for the tab's login.
export const tokenRefresh = new TokenRefreshCoordinator()
ssoAuthState.onEnd(() => tokenRefresh.syncSession())

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
