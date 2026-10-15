import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react"
import { unstable_batchedUpdates } from "react-dom"
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
  buildInstalledPayload,
  getBearerAuthorization,
  removeSSOUserNameWithClientID,
  GrantType,
  SIGN_IN_ERROR_TITLE,
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
import { NOTIFICATION_SHORTCUT, toast } from "../components/Toast"
import { Button } from "../components/Button"

type ContextProps = {
  sessionData?: AuthPayload
  logout: (options?: LogoutOptions) => void
  refreshAuthToken: (
    settings: Settings,
    refreshToken: string | undefined,
    deadlineSignal?: AbortSignal,
    requestSignal?: AbortSignal,
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

const reducer = (s: State, n: Partial<State>) =>
  Object.entries(n).every(([key, value]) => s[key as keyof State] === value)
    ? s
    : { ...s, ...n }

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
    const result = buildInstalledPayload(
      tokenResponse,
      settings["acl.oidc.groups.encoded.in.token"],
      grantType,
      ssoAuthState.getAuthPayload(),
    )
    if ("error" in result) {
      callbacks.current.logout(result.error)
      return undefined
    }
    const installed = result.payload
    toast.dismiss(REFRESH_FAILED_TOAST_ID)
    ssoAuthState.setAuthPayload(installed)
    // A background refresh must not erase a different tab's password login.
    if (grantType === "authorization_code") {
      removeValue(StoreKey.REST_TOKEN)
      removeValue(StoreKey.BASIC_AUTH_HEADER)
    }
    // React 17 does not batch promise callbacks automatically.
    unstable_batchedUpdates(() => {
      setSessionData(installed)
      dispatch({ view: View.ready })
    })
    setValue(StoreKey.SSO_SESSION_ACTIVE, "true")
    return installed
  }

  const refreshAuthToken = async (
    settings: Settings,
    refreshToken: string | undefined,
    deadlineSignal: AbortSignal = new AbortController().signal,
    requestSignal: AbortSignal = new AbortController().signal,
  ) => {
    const originalSession = ssoAuthState.getAuthPayload()
    const response = await getAuthToken(
      settings,
      {
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: settings["acl.oidc.client.id"],
      },
      requestSignal,
    )
    // Transient HTTP failures take the same backoff path as transport failures,
    // regardless of whether their bodies are JSON or HTML.
    if (response.status === 429 || response.status >= 500) {
      throw new Error(`Identity provider unavailable (HTTP ${response.status})`)
    }
    // The wait signal marks late errors, not network cancellation. Preserve a
    // late rotated token until the separate request deadline expires.
    const tokenResponse = await readAuthTokenResponse(response, deadlineSignal)
    if (
      requestSignal.aborted ||
      !originalSession ||
      ssoAuthState.getAuthPayload() !== originalSession
    ) {
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
        if (!authPayload || toast.isActive(REFRESH_FAILED_TOAST_ID)) return
        const expiry = authPayload.expires_at
          ? new Date(authPayload.expires_at)
          : undefined
        const remaining = expiry && expiry.getTime() > Date.now()
        toast.error(
          <div>
            <p>
              {remaining
                ? `Could not renew your SSO session. Your current token expires at ${expiry.toLocaleTimeString()}.`
                : "Could not renew your SSO session. Queries are paused until renewal succeeds."}
            </p>
            <Button
              size="sm"
              onClick={() =>
                callbacks.current.logout({ clearSSOSession: true })
              }
            >
              Sign in again
            </Button>
            <small>
              Close any open dialog, then press {NOTIFICATION_SHORTCUT} to focus
              this notification.
            </small>
          </div>,
          {
            autoClose: false,
            closeOnClick: false,
            toastId: REFRESH_FAILED_TOAST_ID,
          },
        )
      })

      subscribe(EventType.MSG_CONNECTION_UNAUTHORIZED, () => {
        handleSSOUnauthorized((options) => callbacks.current.logout(options))
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
          callbacks.current.logout({ promptForLogin: true })
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
          callbacks.current.logout(exchange.signInError)
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
          callbacks.current.redirectToAuthorizationUrl({ isRetry: true })
        } else {
          // If the error is not in response for a silent authorization code request, display the error
          restoreUrlAfterOAuthCallback()
          callbacks.current.logout({
            errorTitle: SIGN_IN_ERROR_TITLE,
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
        callbacks.current.redirectToAuthorizationUrl({ prompt: "none" })
      } else {
        // Stop loading and display the login state
        uiAuthLogin()
      }
    } else if (settings["acl.basic.auth.realm.enabled"]) {
      await basicAuthLogin()
    } else {
      // Subscribe for any subsequent REST 401 responses (incorrect token, etc)
      subscribe(EventType.MSG_CONNECTION_UNAUTHORIZED, () => {
        if (ssoAuthState.isAuthenticated()) callbacks.current.logout()
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
    ssoAuthState.endSession()
    // Session-end listeners clear client credentials, pending confirmations,
    // refresh work and telemetry timers even when this document does not reload.
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
    unstable_batchedUpdates(() => {
      setSessionData(undefined)
      dispatch({ view: View.login, errorTitle, errorMessage, isDisconnection })
    })
  }

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
          callbacks.current.logout({
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

  // Stable public callbacks delegate to this render's implementation.
  const callbacks = useRef({
    logout,
    refreshAuthToken,
    redirectToAuthorizationUrl,
  })
  callbacks.current = { logout, refreshAuthToken, redirectToAuthorizationUrl }
  const stableCallbacks = useMemo<Omit<ContextProps, "sessionData">>(
    () => ({
      logout: (options) => callbacks.current.logout(options),
      refreshAuthToken: (...args) =>
        callbacks.current.refreshAuthToken(...args),
      redirectToAuthorizationUrl: (options) =>
        callbacks.current.redirectToAuthorizationUrl(options),
    }),
    [],
  )
  const contextValue = useMemo<ContextProps>(
    () => ({ sessionData, ...stableCallbacks }),
    [sessionData, stableCallbacks],
  )

  const views: { [key in View]: () => React.ReactNode } = {
    [View.loading]: () => null,
    [View.ready]: () => (
      <AuthContext.Provider value={contextValue}>
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
