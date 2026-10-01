import { AuthPayload } from "./types"

class SsoAuthState {
  private authPayload: AuthPayload | null = null
  private refreshFailed = false

  setAuthPayload(authPayload: AuthPayload) {
    this.authPayload = authPayload
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
    this.authPayload = null
    this.refreshFailed = false
  }
}

export const ssoAuthState = new SsoAuthState()
