import { getValue, removeValue, setValue } from "../../utils/localStorage"
import { StoreKey } from "../../utils/localStorage/types"
import { ssoAuthState } from "./ssoAuthState"

import type { LogoutOptions } from "./types"

type Logout = (options?: LogoutOptions) => void

// Handles both OIDC and password sessions on an OIDC-enabled server. Only
// OIDC refresh failures receive the expired-SSO message.
export const handleSSOUnauthorized = (logout: Logout) => {
  // A failed refresh can release many queries with the same expired token.
  // Once the first 401 logs out, their remaining responses are not new
  // redirects and must not clear the saved SSO session or login error.
  if (!ssoAuthState.isAuthenticated()) {
    return
  }

  const logoutOptions = ssoAuthState.hasRefreshFailed()
    ? {
        errorTitle: "Your SSO session has expired",
        errorMessage:
          "Could not refresh your SSO session. Please sign in again.",
      }
    : {}
  const count = parseInt(getValue(StoreKey.OAUTH_REDIRECT_COUNT), 10)
  if (!isNaN(count) && count >= 5) {
    // Distinct failed sign-ins still trip the redirect-loop guard.
    removeValue(StoreKey.OAUTH_REDIRECT_COUNT)
    logout({ ...logoutOptions, promptForLogin: true, clearSSOSession: true })
  } else {
    setValue(StoreKey.OAUTH_REDIRECT_COUNT, JSON.stringify((count || 0) + 1))
    logout(logoutOptions)
  }
}
