import "../../test/stubBrowserGlobals"
import { afterEach, describe, expect, it, vi } from "vitest"
import { StoreKey } from "../../utils/localStorage/types"
import { ssoAuthState } from "./ssoAuthState"
import { handleSSOUnauthorized } from "./handleUnauthorized"
import type { AuthPayload } from "./types"

afterEach(() => {
  localStorage.clear()
  ssoAuthState.clearAuthPayload()
})

const login = () => {
  ssoAuthState.setAuthPayload({ access_token: "token" } as AuthPayload)
  localStorage.setItem(StoreKey.SSO_SESSION_ACTIVE, "true")
}

describe("SSO unauthorized responses", () => {
  it("ignores a burst of 401s after logout and preserves the refresh error", () => {
    login()
    ssoAuthState.markRefreshFailed()
    const logout = vi.fn(() => ssoAuthState.clearAuthPayload())

    for (let i = 0; i < 6; i++) handleSSOUnauthorized(logout)

    expect(logout).toHaveBeenCalledTimes(1)
    expect(logout).toHaveBeenCalledWith({
      errorTitle: "Your SSO session has expired",
      errorMessage: "Could not refresh your SSO session. Please sign in again.",
    })
    expect(localStorage.getItem(StoreKey.OAUTH_REDIRECT_COUNT)).toBe("1")
    expect(localStorage.getItem(StoreKey.SSO_SESSION_ACTIVE)).toBe("true")
  })

  it("still breaks a loop of six distinct failed logins", () => {
    const logout = vi.fn(() => ssoAuthState.clearAuthPayload())

    for (let i = 0; i < 6; i++) {
      login()
      handleSSOUnauthorized(logout)
    }

    expect(logout).toHaveBeenCalledTimes(6)
    expect(logout).toHaveBeenLastCalledWith({
      promptForLogin: true,
      clearSSOSession: true,
    })
    expect(localStorage.getItem(StoreKey.OAUTH_REDIRECT_COUNT)).toBeNull()
  })
})
