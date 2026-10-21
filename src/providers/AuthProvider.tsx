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
import { authSessionState } from "../modules/OAuth2/authSessionState"
import { handleSSOUnauthorized } from "../modules/OAuth2/handleUnauthorized"
import { toast, REFRESH_FAILED_TOAST_ID } from "../components/Toast"
import { questClient } from "../utils/questdb/queryClient"
import { RefreshFailedWarning } from "../modules/OAuth2/views/refreshFailedWarning"
import {
  UNFINISHED_WRITES_TOAST_ID,
  UnfinishedWritesWarning,
} from "../modules/OAuth2/views/unfinishedWritesWarning"
import { useEndedSessionWriteCount } from "../hooks/useEndedSessionWriteCount"

type ContextProps = {
  sessionData?: AuthPayload
  logout: (options?: LogoutOptions) => void
  signInAgain: () => void
  refreshAuthToken: (
    settings: Settings,
    refreshToken: string | undefined,
    deadlineSignal: AbortSignal,
    requestSignal: AbortSignal,
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
  signInAgain: () => {},
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

const INTERRUPTED_REQUESTS_MESSAGE =
  "Running requests were interrupted or may still be finishing; statements may have executed. Verify their outcomes before running them again."

// Capture uncertainty before session-end listeners abort and forget work.
// Sent queries are aborted, but uploads already being sent still finish.
const explainInterruptedRequests = (options: LogoutOptions): LogoutOptions =>
  questClient.hasSentRequests()
    ? {
        ...options,
        errorMessage: [options.errorMessage, INTERRUPTED_REQUESTS_MESSAGE]
          .filter(Boolean)
          .join(" "),
      }
    : options

// Logging out from the toolbar reloads the page at once, which cancels this
// session's running work, including, unlike signing in again, uploads already
// being sent. Ask before the session ends, so that declining keeps it.
const confirmReloadingLogout = () =>
  !questClient.hasActiveRequests() ||
  window.confirm(
    questClient.hasSentRequests()
      ? "Logging out reloads the page and cancels everything still running: statements may already have executed, and a cancelled CSV upload can leave a partially imported table. Log out?"
      : "Logging out cancels requests that have not been sent yet. Log out?",
  )

export const AuthContext = createContext<ContextProps>(defaultValues)

const reducer = (s: State, n: Partial<State>) =>
  Object.entries(n).every(([key, value]) => s[key as keyof State] === value)
    ? s
    : { ...s, ...n }

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const { settings } = useSettings()
  const callbacks = useRef<
    Omit<ContextProps, "sessionData" | "redirectToAuthorizationUrl"> & {
      redirectToAuthorizationUrl: (options?: {
        prompt?: "login" | "none"
        isRetry?: boolean
      }) => void
    }
  >(defaultValues)
  const [sessionData, setSessionData] =
    useState<ContextProps["sessionData"]>(undefined)
  const [state, dispatch] = useReducer(reducer, initialState)
  // Uploads and settings saves keep running after their session ends, until
  // they settle. Leaving the page cancels them, so ask before leaving in every
  // view: signing in again with a password replaces Login without leaving it.
  const unfinishedWrites = useEndedSessionWriteCount()
  const hasUnfinishedWrites = unfinishedWrites > 0
  // Logging out from the toolbar still reloads at once.
  const reloadingRef = useRef(false)
  useEffect(() => {
    if (!hasUnfinishedWrites) return
    const confirmLeave = (event: BeforeUnloadEvent) => {
      if (reloadingRef.current) return
      event.preventDefault()
      // Browsers without preventDefault() support only prompt for this.
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", confirmLeave)
    return () => window.removeEventListener("beforeunload", confirmLeave)
  }, [hasUnfinishedWrites])
  // Login explains them itself. After signing in again, the console does.
  const isReady = state.view === View.ready
  useEffect(() => {
    if (!isReady || !hasUnfinishedWrites) return
    toast.warning(<UnfinishedWritesWarning />, {
      autoClose: false,
      closeOnClick: false,
      toastId: UNFINISHED_WRITES_TOAST_ID,
    })
    return () => toast.dismiss(UNFINISHED_WRITES_TOAST_ID)
  }, [isReady, hasUnfinishedWrites])
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
      authSessionState.getAuthPayload(),
    )
    if ("error" in result) {
      callbacks.current.logout(result.error)
      return undefined
    }
    const installed = result.payload
    toast.dismiss(REFRESH_FAILED_TOAST_ID)
    authSessionState.setAuthPayload(installed)
    // Login choice is tab-local; never erase another tab's password credentials.
    sessionStorage.setItem(StoreKey.LOGIN_METHOD, "sso")
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
    deadlineSignal: AbortSignal,
    requestSignal: AbortSignal,
  ) => {
    const payloadAtStart = authSessionState.getAuthPayload()
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
      !payloadAtStart ||
      authSessionState.getAuthPayload() !== payloadAtStart
    ) {
      return undefined
    }
    return setAuthToken(tokenResponse, settings, "refresh_token")
  }

  const showRefreshFailedWarning = () => {
    const payload = authSessionState.getAuthPayload()
    if (!payload || toast.isActive(REFRESH_FAILED_TOAST_ID)) return
    toast.error(
      <RefreshFailedWarning
        expiresAt={payload.expires_at}
        onSignIn={() => callbacks.current.signInAgain()}
      />,
      {
        autoClose: false,
        closeOnClick: false,
        toastId: REFRESH_FAILED_TOAST_ID,
      },
    )
  }

  const setupOAuth2 = async (
    settings: Settings,
    isCurrentOwner: () => boolean,
  ) => {
    if (!settings["acl.enabled"]) {
      dispatch({ view: View.ready })
      return
    }

    // Proceed with the OAuth2 flow only if it is enabled on the server
    if (settings["acl.oidc.enabled"]) {
      subscribe(EventType.MSG_AUTH_REFRESH_FAILED, showRefreshFailedWarning)

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
      const retainedPayload = authSessionState.getAuthPayload()
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
        const session = authSessionState.capture()
        const exchange = await exchangeAuthorizationCode(settings, {
          grant_type: "authorization_code",
          code,
          code_verifier,
          client_id: settings["acl.oidc.client.id"],
          redirect_uri:
            settings["acl.oidc.redirect.uri"] || getDefaultRedirectUri(),
        })
        // Unlike rotating refreshes, an initial exchange belongs only to the
        // provider and login that started it. Settings recovery or logout may
        // have replaced that owner while its token response was pending.
        if (!isCurrentOwner() || !session.isCurrent()) return
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
      } else if (retainedPayload) {
        // Settings recovery can remount the providers without ending this
        // tab's SSO session. Resume its refresh capability as well as its bearer.
        unstable_batchedUpdates(() => {
          setSessionData(retainedPayload)
          dispatch({ view: View.ready })
        })
        if (authSessionState.hasRefreshFailed()) showRefreshFailedWarning()
      } else if (
        sessionStorage.getItem(StoreKey.LOGIN_METHOD) !== "password" &&
        ssoUsername &&
        getValue(StoreKey.SSO_SESSION_ACTIVE) &&
        (sessionStorage.getItem(StoreKey.LOGIN_METHOD) === "sso" ||
          (!getValue(StoreKey.REST_TOKEN) &&
            !getValue(StoreKey.BASIC_AUTH_HEADER)))
      ) {
        // Resume this tab's SSO choice even if another tab stored password
        // credentials. Otherwise only try silent SSO when none are stored.
        callbacks.current.redirectToAuthorizationUrl({ prompt: "none" })
      } else {
        // Stop loading and display the login state. A tab that signs in with
        // SSO but has no SSO session to resume, e.g. after logging out, shows
        // Login rather than another tab's password login.
        uiAuthLogin(sessionStorage.getItem(StoreKey.LOGIN_METHOD) !== "sso")
      }
    } else if (settings["acl.basic.auth.realm.enabled"]) {
      await basicAuthLogin()
    } else {
      // Subscribe for any subsequent REST 401 responses (incorrect token, etc)
      subscribe(EventType.MSG_CONNECTION_UNAUTHORIZED, () => {
        if (authSessionState.isAuthenticated()) callbacks.current.logout()
      })

      //username + pwd via login page
      uiAuthLogin()
    }
  }

  const basicAuthLogin = async () => {
    // run a simple query to force basic auth by browser
    const response = await fetch(`exec?query=select 42`)
    if (response.status === 200) {
      authSessionState.markNonSSOAuthenticated()
      dispatch({ view: View.ready })
    } else {
      await basicAuthLogin()
    }
  }

  const startServerSession = async (tokenResponse: AuthPayload) => {
    // execute a simple query with session=true
    const authorization = getBearerAuthorization(tokenResponse)
    if (!authorization) return
    const session = authSessionState.capture()
    // Downloads authenticate only with this cookie session. The server opens
    // it once it has authorized the request, even if the SQL then fails.
    const opened = await fetch(`exec?query=select 2&session=true`, {
      headers: { Authorization: authorization },
    }).then(
      (response) => response.ok || response.status === 400,
      () => false,
    )
    if (!opened) questClient.noteCookieSessionNotOpened(session)
  }

  const destroyServerSession = () => {
    void fetch(`exec?query=select 2&session=false`, { keepalive: true }).catch(
      () => {
        // ignore result
      },
    )
  }

  const uiAuthLogin = (useStoredCredentials = true) => {
    // Check if user is authenticated already with basic auth
    const token = getValue(StoreKey.REST_TOKEN)
    const basicAuthHeader = getValue(StoreKey.BASIC_AUTH_HEADER)
    if (useStoredCredentials && (token || basicAuthHeader)) {
      authSessionState.markNonSSOAuthenticated()
      sessionStorage.setItem(StoreKey.LOGIN_METHOD, "password")
      dispatch({ view: View.ready })
    } else {
      // Settings recovery remounts this provider without ending the tab's
      // login. If it cannot go on, e.g. another tab has removed the shared
      // password credentials since, end that login first: whoever signs in
      // next must start a new session, without the previous login's requests
      // or last result.
      if (authSessionState.isAuthenticated()) {
        unstable_batchedUpdates(() =>
          authSessionState.endSession(explainInterruptedRequests({})),
        )
      }
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

  const logout = (options: LogoutOptions = {}) => {
    const { promptForLogin, reload, clearSSOSession } = options
    if (reload && !confirmReloadingLogout()) return
    const logoutOptions = explainInterruptedRequests(options)
    toast.dismiss(REFRESH_FAILED_TOAST_ID)
    // Finish storage cleanup before session-end listeners can render Login.
    removeValue(StoreKey.OAUTH_PROMPT)
    sessionStorage.removeItem(StoreKey.OAUTH_RETURN_PARAMS)
    // The login method is tab-local, but password credentials are shared.
    // Only a tab signed in with a password removes them. An SSO tab leaves
    // them to the tabs that signed in with them, and keeps its method, so
    // that reloading it does not sign in with them either.
    if (sessionStorage.getItem(StoreKey.LOGIN_METHOD) === "password") {
      sessionStorage.removeItem(StoreKey.LOGIN_METHOD)
      removeValue(StoreKey.REST_TOKEN)
      removeValue(StoreKey.BASIC_AUTH_HEADER)
    }
    if (clearSSOSession) {
      removeValue(StoreKey.SSO_SESSION_ACTIVE)
    }
    if (promptForLogin && settings["acl.oidc.client.id"]) {
      removeSSOUserNameWithClientID(settings["acl.oidc.client.id"])
    }
    // Session-end listeners clear client credentials, pending confirmations,
    // refresh work and telemetry timers, and, unless this document reloads,
    // the last query result. React 17 does not batch promise continuations:
    // their updates and showing Login must be one commit, before console
    // effects can run again.
    unstable_batchedUpdates(() => authSessionState.endSession(logoutOptions))
    destroyServerSession()
    if (reload) {
      // This session's running work was confirmed above. An earlier session's
      // writes are not asked about again: the console's warning says that
      // logging out cancels them, and staying would now keep a console without
      // a session, because Login is not shown before the reload.
      reloadingRef.current = true
      window.location.reload()
    }
  }

  useEffect(() => {
    let active = true
    // Settings recovery may change the server's authentication mode. End the
    // old SSO lifecycle before subscribing this owner or reading password
    // credentials, without deleting those credentials through logout().
    if (
      authSessionState.isSSOAuthenticated() &&
      (!settings["acl.enabled"] || !settings["acl.oidc.enabled"])
    ) {
      unstable_batchedUpdates(() => authSessionState.endSession())
    }
    // A rotating refresh can outlive Settings recovery and its original auth
    // owner. Shared teardown must notify the mounted owner, not only the
    // provider instance that started the refresh. Do not recursively log out.
    unsubscribeRef.current.push(
      authSessionState.onEnd(
        ({ errorTitle, errorMessage, isDisconnection, reload } = {}) => {
          if (reload) return
          unstable_batchedUpdates(() => {
            setSessionData(undefined)
            dispatch({
              view: View.login,
              errorTitle,
              errorMessage,
              isDisconnection,
            })
          })
        },
      ),
    )
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

    void setupOAuth2(settings, () => active)
    return () => {
      active = false
      unsubscribeRef.current.forEach((unsubscribe) => unsubscribe())
      unsubscribeRef.current = []
      toast.dismiss(REFRESH_FAILED_TOAST_ID)
    }
  }, [])

  const signInAgain = () => {
    // Requests still waiting for renewal were never sent, so cancelling them
    // cannot leave a statement half-done. Only a sent request is uncertain.
    const sent = questClient.hasSentRequests()
    if (
      questClient.hasActiveRequests() &&
      !window.confirm(
        sent
          ? "Signing in again interrupts running queries, and statements may already have executed. Uploads already being sent continue, but only while this tab stays open. End this session?"
          : "Signing in again cancels requests that have not been sent yet. End this session?",
      )
    )
      return
    // logout() explains interrupted sent requests itself. It keeps the SSO
    // session flag: other tabs share it to sign in silently when they reload,
    // and this tab still signs in again through the identity provider.
    callbacks.current.logout({
      errorTitle: "Sign in again",
      errorMessage: sent
        ? "Your previous session has ended."
        : "Your previous session has ended. Please sign in again.",
    })
  }

  // Stable public callbacks delegate to this render's implementation.
  callbacks.current = {
    logout,
    signInAgain,
    refreshAuthToken,
    redirectToAuthorizationUrl,
  }
  const stableCallbacks = useMemo<Omit<ContextProps, "sessionData">>(
    () => ({
      logout: (options) => callbacks.current.logout(options),
      signInAgain: () => callbacks.current.signInAgain(),
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
          sessionStorage.setItem(StoreKey.LOGIN_METHOD, "password")
          authSessionState.markNonSSOAuthenticated()
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
        unfinishedWrites={unfinishedWrites}
      />
    ),
  }

  return <>{views[state.view]()}</>
}

export const useAuth = () => useContext(AuthContext)
