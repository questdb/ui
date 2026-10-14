import { AuthPayload } from "./types"

class SsoAuthState {
  private authPayload: AuthPayload | null = null
  private refreshFailed = false
  private authenticated = false
  private sessionId = 0

  getSessionId() {
    return this.sessionId
  }

  // This state belongs to the tab, unlike credentials in localStorage.
  markNonSSOAuthenticated() {
    if (!this.authenticated) this.sessionId++
    this.authenticated = true
  }

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

  isSSOAuthenticated(): boolean {
    return !!this.authPayload
  }

  clearAuthPayload() {
    this.sessionId++
    this.authPayload = null
    this.authenticated = false
    this.refreshFailed = false
  }
}

export const ssoAuthState = new SsoAuthState()
