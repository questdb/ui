import "../../test/stubBrowserGlobals"
import { afterEach, describe, expect, it, vi } from "vitest"
import { StoreKey } from "../../utils/localStorage/types"
import { authSessionState } from "./authSessionState"
import { handleSSOUnauthorized } from "./handleUnauthorized"
import type { AuthPayload } from "./types"

afterEach(() => {
  localStorage.clear()
  authSessionState.endSession()
})

const login = () => {
  authSessionState.setAuthPayload({ access_token: "token" } as AuthPayload)
  localStorage.setItem(StoreKey.SSO_SESSION_ACTIVE, "true")
}

describe("SSO unauthorized responses", () => {
  it("ignores a burst of 401s after logout and preserves the refresh error", () => {
    login()
    authSessionState.markRefreshFailed()
    const logout = vi.fn(() => authSessionState.endSession())

    for (let i = 0; i < 6; i++) handleSSOUnauthorized(logout)

    expect(logout).toHaveBeenCalledTimes(1)
    expect(logout).toHaveBeenCalledWith({
      errorTitle: "Your SSO session has expired",
      errorMessage: "Could not renew your SSO session. Please sign in again.",
    })
    expect(localStorage.getItem(StoreKey.OAUTH_REDIRECT_COUNT)).toBe("1")
    expect(localStorage.getItem(StoreKey.SSO_SESSION_ACTIVE)).toBe("true")
  })

  it.each([StoreKey.REST_TOKEN, StoreKey.BASIC_AUTH_HEADER])(
    "handles the current tab's 401 even after another tab removes %s",
    (key) => {
      localStorage.setItem(key, "credential")
      authSessionState.markNonSSOAuthenticated()
      localStorage.removeItem(key)
      const logout = vi.fn(() => authSessionState.endSession())
      handleSSOUnauthorized(logout)
      handleSSOUnauthorized(logout)
      expect(logout).toHaveBeenCalledTimes(1)
      expect(logout).toHaveBeenCalledWith({})
    },
  )

  it("does not treat another tab's stored credentials as a login in this tab", () => {
    localStorage.setItem(StoreKey.REST_TOKEN, "another-tab")
    const logout = vi.fn()
    handleSSOUnauthorized(logout)
    expect(logout).not.toHaveBeenCalled()
  })

  it("handles a new password login after the previous session logged out", () => {
    const logout = vi.fn(() => authSessionState.endSession())
    for (let i = 0; i < 2; i++) {
      authSessionState.markNonSSOAuthenticated()
      handleSSOUnauthorized(logout)
    }
    expect(logout).toHaveBeenCalledTimes(2)
  })

  it("still breaks a loop of six distinct failed logins", () => {
    const logout = vi.fn(() => authSessionState.endSession())

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
