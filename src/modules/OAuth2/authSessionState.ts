import { AuthPayload, LogoutOptions } from "./types"

export type AuthSession = { isCurrent: () => boolean }

// Tab-local authentication for ALL login methods. The SSO payload is only
// present for OIDC; stored REST/basic credentials do not make another tab
// authenticated. Keep these predicates distinct when handling a 401.
class AuthSessionState {
  private authPayload: AuthPayload | null = null
  private refreshFailed = false
  private authenticated = false
  private sessionId = 0
  private beforeEndListeners = new Set<() => void>()
  private endListeners = new Set<(options?: LogoutOptions) => void>()

  capture(): AuthSession {
    const sessionId = this.sessionId
    return { isCurrent: () => this.sessionId === sessionId }
  }

  // Runs before onEnd listeners abort this session's requests. Supersede
  // in-flight work here so its aborted results are not recorded, or flush
  // already-accepted data. Never start new network work.
  beforeEnd(listener: () => void) {
    this.beforeEndListeners.add(listener)
    return () => {
      this.beforeEndListeners.delete(listener)
    }
  }

  onEnd(listener: (options?: LogoutOptions) => void) {
    this.endListeners.add(listener)
    return () => {
      this.endListeners.delete(listener)
    }
  }

  getSessionId() {
    return this.sessionId
  }

  // This state belongs to the tab, unlike credentials in localStorage.
  markNonSSOAuthenticated() {
    if (!this.authenticated) this.sessionId++
    this.authenticated = true
  }

  // Any successful login in this tab (SSO, password or HTTP basic).
  isAuthenticated(): boolean {
    return this.authenticated
  }

  setAuthPayload(authPayload: AuthPayload) {
    if (!this.authPayload) this.sessionId++
    this.authPayload = authPayload
    this.authenticated = true
    this.refreshFailed = false
  }

  markRefreshFailed() {
    this.refreshFailed = true
  }

  hasRefreshFailed(): boolean {
    return this.refreshFailed
  }

  getAuthPayload(): AuthPayload | null {
    return this.authPayload
  }

  // An installed OIDC session, eligible for token refresh.
  isSSOAuthenticated(): boolean {
    return !!this.authPayload
  }

  // Ends the tab's session for every login method, not just OIDC.
  endSession(options?: LogoutOptions) {
    this.beforeEndListeners.forEach((listener) => listener())
    this.sessionId++
    this.authPayload = null
    this.authenticated = false
    this.refreshFailed = false
    this.endListeners.forEach((listener) => listener(options))
  }
}

export const authSessionState = new AuthSessionState()
