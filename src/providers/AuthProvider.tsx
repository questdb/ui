import React, {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react"
import {
  AuthPayload,
  LogoutOptions,
  TokenResponse,
} from "../modules/OAuth2/types"
import { StoreKey } from "../utils/localStorage/types"
import { getValue, removeValue, setValue } from "../utils/localStorage"
import {
  getAuthorisationURL,
  getAuthToken,
  exchangeAuthorizationCode,
  readAuthTokenResponse,
  getSSOUserNameWithClientID,
  getTokenExpirationDate,
  getBearerAuthorization,
  getMissingIdTokenError,
  removeSSOUserNameWithClientID,
  GrantType,
} from "../modules/OAuth2/utils"
import {
  generateCodeChallenge,
  generateCodeVerifier,
  generateState,
} from "../modules/OAuth2/pkce"
import { eventBus } from "../modules/EventBus"
import { EventType } from "../modules/EventBus/types"
import { ErrorResult } from "../utils"
import { Login } from "../modules/OAuth2/views/login"
import { Settings } from "./SettingsProvider/types"
import { useSettings } from "./SettingsProvider"
import { ssoAuthState } from "../modules/OAuth2/ssoAuthState"
import { handleSSOUnauthorized } from "../modules/OAuth2/handleUnauthorized"
import { toast } from "../components/Toast"

type ContextProps = {
  sessionData?: Partial<AuthPayload>
  logout: (options?: LogoutOptions) => void
  refreshAuthToken: (
    settings: Settings,
    refreshToken: string | undefined,
    signal?: AbortSignal,
  ) => Promise<AuthPayload | undefined>
  redirectToAuthorizationUrl: (options?: { prompt?: "login" | "none" }) => void
}

enum View {
  ready,
  loading,
  login,
}

type State = {
  view: View
  errorTitle?: string
  errorMessage?: string
  isDisconnection?: boolean
}

const initialState: {
  view: View
  errorTitle?: string
  errorMessage?: string
  isDisconnection?: boolean
} = {
  view: View.loading,
}

const defaultValues: ContextProps = {
  sessionData: undefined,
  logout: () => {},
  refreshAuthToken: () => Promise.resolve(undefined),
  redirectToAuthorizationUrl: () => {},
}

class OAuth2Error {
  error: string | null
  error_description: string | null

  constructor(error: string | null, error_description: string | null) {
    this.error = error
    this.error_description = error_description
  }
}

const REFRESH_FAILED_TOAST_ID = "sso-refresh-failed"

const OAUTH_CALLBACK_PARAMS = [
  "code",
  "state",
  "error",
  "error_description",
  "session_state",
  "iss",
] as const

const stripOAuthCallbackParams = (search: string) => {
  const params = new URLSearchParams(search)
  OAUTH_CALLBACK_PARAMS.forEach((key) => params.delete(key))
  return params
}

// Replaces the callback params with the ones saved before the redirect to the
// provider, whatever the outcome of the sign-in. Otherwise a reload resubmits
// the used code, and its invalid_grant error replaces the actual sign-in error.
const restoreUrlAfterOAuthCallback = () => {
  if (!history.replaceState) return
  const restored = stripOAuthCallbackParams(window.location.search)
  const savedParams = sessionStorage.getItem(StoreKey.OAUTH_RETURN_PARAMS)
  sessionStorage.removeItem(StoreKey.OAUTH_RETURN_PARAMS)
  if (savedParams) {
    new URLSearchParams(savedParams).forEach((value, key) => {
      if (!restored.has(key)) restored.set(key, value)
    })
  }
  const queryString = restored.toString()
  history.replaceState(
    null,
    "",
    location.pathname + (queryString ? `?${queryString}` : ""),
  )
}

const getDefaultRedirectUri = () =>
  window.location.origin + window.location.pathname

export const AuthContext = createContext<ContextProps>(defaultValues)

const reducer = (s: State, n: Partial<State>) => ({ ...s, ...n })

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const { settings } = useSettings()
  const [sessionData, setSessionData] =
    useState<ContextProps["sessionData"]>(undefined)
  const [state, dispatch] = useReducer(reducer, initialState)
  const unsubscribeRef = useRef<Array<() => void>>([])
  const subscribe = <T,>(type: EventType, handler: (payload?: T) => void) => {
    eventBus.subscribe(type, handler)
    unsubscribeRef.current.push(() => eventBus.unsubscribe(type, handler))
  }

  // Returns only a fully installed token, never an error or rejected bearer.
  const setAuthToken = (
    tokenResponse: TokenResponse,
    settings: Settings,
    grantType: GrantType,
  ): AuthPayload | undefined => {
    if (!tokenResponse.access_token || !tokenResponse.expires_in) {
      logout({
        errorTitle: "Something went wrong.",
        errorMessage:
          tokenResponse.error_description ??
          (grantType === "refresh_token"
            ? "Could not renew your SSO session. Please sign in again."
            : "Could not complete the sign-in. Please try again."),
      })
      return undefined
    }
    const payload = {
      ...tokenResponse,
      access_token: tokenResponse.access_token,
      expires_in: tokenResponse.expires_in,
      token_type: tokenResponse.token_type ?? "Bearer",
      // Some providers rotate this token, others omit it on refresh.
      refresh_token:
        tokenResponse.refresh_token ??
        (grantType === "refresh_token"
          ? ssoAuthState.getAuthPayload()?.refresh_token
          : undefined),
      groups_encoded_in_token: settings["acl.oidc.groups.encoded.in.token"],
    }
    const missingIdTokenError = getMissingIdTokenError(payload, grantType)
    if (missingIdTokenError) {
      console.warn(
        "The server requires an ID token (acl.oidc.groups.encoded.in.token). Check the openid scope and ID-token issuance for the " +
          grantType +
          " grant.",
      )
      logout(missingIdTokenError)
      return undefined
    }
    const installed: AuthPayload = {
      ...payload,
      expires_at: getTokenExpirationDate(payload).toISOString(),
    }
    toast.dismiss(REFRESH_FAILED_TOAST_ID)
    ssoAuthState.setAuthPayload(installed)
    // A background refresh must not erase a different tab's password login.
    if (grantType === "authorization_code") {
      removeValue(StoreKey.REST_TOKEN)
      removeValue(StoreKey.BASIC_AUTH_HEADER)
    }
    setSessionData(installed)
    setValue(StoreKey.SSO_SESSION_ACTIVE, "true")
    return installed
  }

  const refreshAuthToken = async (
    settings: Settings,
    refreshToken: string | undefined,
    signal?: AbortSignal,
  ) => {
    const originalSession = ssoAuthState.getAuthPayload()
    const response = await getAuthToken(settings, {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: settings["acl.oidc.client.id"],
    })
    // The signal marks the wait deadline, not network cancellation. Keep a
    // late success because the provider may already have rotated the token.
    const tokenResponse = await readAuthTokenResponse(response, signal)
    if (!originalSession || ssoAuthState.getAuthPayload() !== originalSession) {
      return undefined
    }
    return setAuthToken(tokenResponse, settings, "refresh_token")
  }

  const setupOAuth2 = async (settings: Settings) => {
    if (!settings["acl.enabled"]) {
      dispatch({ view: View.ready })
      return
    }

    // Proceed with the OAuth2 flow only if it is enabled on the server
    if (settings["acl.oidc.enabled"]) {
      subscribe(EventType.MSG_AUTH_REFRESH_FAILED, () => {
        const authPayload = ssoAuthState.getAuthPayload()
        if (
          authPayload &&
          new Date(authPayload.expires_at).getTime() > Date.now()
        ) {
          toast.error(
            "Could not refresh your SSO session. We'll retry, but you may be signed out when your current session expires.",
            { autoClose: false, toastId: REFRESH_FAILED_TOAST_ID },
          )
        }
      })

      subscribe(EventType.MSG_CONNECTION_UNAUTHORIZED, () => {
        handleSSOUnauthorized(logout)
      })

      // Clear the 401 auth redirect loop in case the connection is back to normal
      subscribe(EventType.MSG_CONNECTION_OK, () => {
        removeValue(StoreKey.OAUTH_REDIRECT_COUNT)
      })

      const ssoUsername = settings["acl.oidc.client.id"]
        ? getSSOUserNameWithClientID(settings["acl.oidc.client.id"])
        : ""
      const urlParams = new URLSearchParams(window.location.search)
      const code = urlParams.get("code")
      const oauth2Error = new OAuth2Error(
        urlParams.get("error"),
        urlParams.get("error_description"),
      )

      if (code !== null) {
        // User has just been redirected back from the OAuth2 provider with an authorization code
        const state = getValue(StoreKey.OAUTH_STATE)
        const stateParam = urlParams.get("state")
        removeValue(StoreKey.OAUTH_STATE)
        restoreUrlAfterOAuthCallback()

        if (
          settings["acl.oidc.state.required"] &&
          (!state || state !== stateParam)
        ) {
          // the callback cannot be tied to a login this browser started
          logout({ promptForLogin: true })
          return
        }

        const code_verifier = getValue(StoreKey.PKCE_CODE_VERIFIER)
        const exchange = await exchangeAuthorizationCode(settings, {
          grant_type: "authorization_code",
          code,
          code_verifier,
          client_id: settings["acl.oidc.client.id"],
          redirect_uri:
            settings["acl.oidc.redirect.uri"] || getDefaultRedirectUri(),
        })
        if ("signInError" in exchange) {
          logout(exchange.signInError)
          return
        }
        const { tokenResponse } = exchange
        const installed = setAuthToken(
          tokenResponse,
          settings,
          "authorization_code",
        )
        if (installed) {
          await startServerSession(installed)
        }
      } else if (oauth2Error.error) {
        // User has just been redirected back from the OAuth2 provider and there is an error
        const previousPrompt = getValue(StoreKey.OAUTH_PROMPT)
        removeValue(StoreKey.OAUTH_PROMPT)
        if (previousPrompt === "none") {
          // If we requested authorization code silently (prompt=none), it could be that the user
          // does not have an active SSO session, so let's send the user to re-authenticate (prompt=login)
          redirectToAuthorizationUrl({ isRetry: true })
        } else {
          // If the error is not in response for a silent authorization code request, display the error
          restoreUrlAfterOAuthCallback()
          logout({
            errorTitle: "Something went wrong.",
            errorMessage:
              oauth2Error.error + ": " + oauth2Error.error_description,
          })
        }
      } else if (
        ssoUsername &&
        getValue(StoreKey.SSO_SESSION_ACTIVE) &&
        !getValue(StoreKey.REST_TOKEN)
      ) {
        // No REST token, so it is a page reload for an SSO user
        // who didn't explicitly log out — try to request a token silently
        redirectToAuthorizationUrl({ prompt: "none" })
      } else {
        // Stop loading and display the login state
        uiAuthLogin()
      }
    } else if (settings["acl.basic.auth.realm.enabled"]) {
      await basicAuthLogin()
    } else {
      // Subscribe for any subsequent REST 401 responses (incorrect token, etc)
      subscribe(EventType.MSG_CONNECTION_UNAUTHORIZED, () => {
        logout()
      })

      //username + pwd via login page
      uiAuthLogin()
    }
  }

  const basicAuthLogin = async () => {
    // run a simple query to force basic auth by browser
    const response = await fetch(`exec?query=select 42`)
    if (response.status === 200) {
      ssoAuthState.markNonSSOAuthenticated()
      dispatch({ view: View.ready })
    } else {
      await basicAuthLogin()
    }
  }

  const startServerSession = async (tokenResponse: AuthPayload) => {
    // execute a simple query with session=true
    const authorization = getBearerAuthorization(tokenResponse)
    if (!authorization) return
    await fetch(`exec?query=select 2&session=true`, {
      headers: { Authorization: authorization },
    })
  }

  const destroyServerSession = () => {
    void fetch(`exec?query=select 2&session=false`, { keepalive: true }).catch(
      () => {
        // ignore result
      },
    )
  }

  const uiAuthLogin = () => {
    // Check if user is authenticated already with basic auth
    const token = getValue(StoreKey.REST_TOKEN)
    const basicAuthHeader = getValue(StoreKey.BASIC_AUTH_HEADER)
    if (token || basicAuthHeader) {
      ssoAuthState.markNonSSOAuthenticated()
      dispatch({ view: View.ready })
    } else {
      // Stop loading and display the login state
      dispatch({ view: View.login })
    }
  }

  const redirectToAuthorizationUrl = ({
    prompt,
    isRetry = false,
  }: {
    prompt?: "login" | "none"
    isRetry?: boolean
  } = {}) => {
    const state = generateState(settings)
    const code_verifier = generateCodeVerifier(settings)
    const code_challenge = generateCodeChallenge(code_verifier)
    setValue(StoreKey.OAUTH_PROMPT, prompt ?? "")
    if (!isRetry) {
      const returnParams = stripOAuthCallbackParams(
        window.location.search,
      ).toString()
      if (returnParams) {
        sessionStorage.setItem(StoreKey.OAUTH_RETURN_PARAMS, returnParams)
      } else {
        sessionStorage.removeItem(StoreKey.OAUTH_RETURN_PARAMS)
      }
    }
    window.location.href = getAuthorisationURL({
      settings,
      code_challenge,
      state,
      prompt,
      redirect_uri:
        settings["acl.oidc.redirect.uri"] || getDefaultRedirectUri(),
    })
  }

  const logout = ({
    promptForLogin,
    errorTitle,
    errorMessage,
    isDisconnection,
    reload,
    clearSSOSession,
  }: LogoutOptions = {}) => {
    toast.dismiss(REFRESH_FAILED_TOAST_ID)
    ssoAuthState.clearAuthPayload()
    setSessionData(undefined)
    removeValue(StoreKey.OAUTH_PROMPT)
    sessionStorage.removeItem(StoreKey.OAUTH_RETURN_PARAMS)
    removeValue(StoreKey.REST_TOKEN)
    removeValue(StoreKey.BASIC_AUTH_HEADER)
    if (clearSSOSession) {
      removeValue(StoreKey.SSO_SESSION_ACTIVE)
    }
    if (promptForLogin && settings["acl.oidc.client.id"]) {
      removeSSOUserNameWithClientID(settings["acl.oidc.client.id"])
    }
    destroyServerSession()
    if (reload) {
      window.location.reload()
      return
    }
    dispatch({ view: View.login, errorTitle, errorMessage, isDisconnection })
  }

  useEffect(() => {
    if (sessionData) {
      dispatch({ view: View.ready })
    }
  }, [sessionData])

  useEffect(() => {
    // If user has no access to the HTTP protocol, they will receive a 403 error response
    // containing a specific message type. If that happens, we display a full screen error page.
    subscribe<ErrorResult>(
      EventType.MSG_CONNECTION_FORBIDDEN,
      (errorPayload) => {
        if (
          errorPayload &&
          errorPayload.error.match(/Access denied.* \[HTTP]/gm)
        ) {
          logout({
            errorTitle: "Oops. You've been disconnected.",
            errorMessage:
              "You are not authorized to use the Web Console. You may try login again or contact your account administrator.",
            isDisconnection: true,
          })
        }
      },
    )

    void setupOAuth2(settings)
    return () => {
      unsubscribeRef.current.forEach((unsubscribe) => unsubscribe())
      unsubscribeRef.current = []
      toast.dismiss(REFRESH_FAILED_TOAST_ID)
    }
  }, [])

  const views: { [key in View]: () => React.ReactNode } = {
    [View.loading]: () => null,
    [View.ready]: () => (
      <AuthContext.Provider
        value={{
          sessionData,
          logout,
          refreshAuthToken,
          redirectToAuthorizationUrl,
        }}
      >
        {children}
      </AuthContext.Provider>
    ),
    [View.login]: () => (
      <Login
        onOAuthLogin={(loginWithDifferentAccount) => {
          redirectToAuthorizationUrl({
            prompt: loginWithDifferentAccount ? "login" : undefined,
          })
        }}
        onBasicAuthSuccess={() => {
          ssoAuthState.markNonSSOAuthenticated()
          dispatch({ view: View.ready })
        }}
        resetErrors={() =>
          dispatch({
            errorTitle: undefined,
            errorMessage: undefined,
            isDisconnection: undefined,
          })
        }
        errorTitle={state.errorTitle}
        errorMessage={state.errorMessage}
        isDisconnection={state.isDisconnection ?? false}
      />
    ),
  }

  return <>{views[state.view]()}</>
}

export const useAuth = () => useContext(AuthContext)
