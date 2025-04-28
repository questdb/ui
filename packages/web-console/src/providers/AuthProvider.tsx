import React, {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useState,
} from "react"
import { AuthPayload } from "../modules/OAuth2/types"
import { StoreKey } from "../utils/localStorage/types"
import { getValue, removeValue, setValue } from "../utils/localStorage"
import {
  getAuthorisationURL,
  getAuthToken,
  getTokenExpirationDate,
  removeSSOUserNameWithClientID,
} from "../modules/OAuth2/utils"
import {
  generateCodeChallenge,
  generateCodeVerifier,
  generateState,
} from "../modules/OAuth2/pkce"
import { eventBus } from "../modules/EventBus"
import { EventType } from "../modules/EventBus/types"
import { ErrorResult } from "../utils"
import { Error } from "../modules/OAuth2/views/error"
import { Login } from "../modules/OAuth2/views/login"
import { Settings } from "./SettingsProvider/types"
import { useSettings } from "./SettingsProvider"

type ContextProps = {
  sessionData?: Partial<AuthPayload>,
  logout: (promptForLogin?: boolean) => void,
  refreshAuthToken: (settings: Settings) => Promise<AuthPayload>,
  redirectToAuthorizationUrl: () => void,
}

enum View {
  ready,
  loading,
  error,
  login,
}

type State = { view: View; errorMessage?: string }

const initialState: { view: View; errorMessage?: string } = {
  view: View.loading,
}

const defaultValues: ContextProps = {
  sessionData: undefined,
  logout: () => {},
  refreshAuthToken: async () => ({} as AuthPayload),
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

export const AuthContext = createContext<ContextProps>(defaultValues)

const reducer = (s: State, n: Partial<State>) => ({ ...s, ...n })

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const { settings } = useSettings()
  const [sessionData, setSessionData] =
    useState<ContextProps["sessionData"]>(undefined)
  const [errorMessage, setErrorMessage] = useState<string | undefined>(
    undefined,
  )
  const [state, dispatch] = useReducer(reducer, initialState)

  const setAuthToken = (tokenResponse: AuthPayload, settings: Settings) => {
    if (tokenResponse.access_token) {
      tokenResponse.groups_encoded_in_token =
        settings["acl.oidc.groups.encoded.in.token"]
      tokenResponse.expires_at = getTokenExpirationDate(
        tokenResponse.expires_in,
      ).toString() // convert from the sec offset
      setValue(StoreKey.AUTH_PAYLOAD, JSON.stringify(tokenResponse))
      // if the token payload does not contain refresh token, token refresh has been disabled in
      // the OAuth2 provider, and we need to clear the refresh token in local storage
      setValue(StoreKey.AUTH_REFRESH_TOKEN, tokenResponse.refresh_token ?? "")
      setSessionData(tokenResponse)
      // Remove the code from the URL
      history.replaceState &&
        history.replaceState(
          null,
          "",
          location.pathname +
            location.search.replace(/[?&]code=[^&]+/, "").replace(/^&/, "?"),
        )
    } else {
      const error = tokenResponse as unknown as OAuth2Error
      // display error message
      dispatch({
        view: View.error,
        errorMessage:
          error.error_description ?? "Error logging in. Please try again.",
      })
    }
  }

  const refreshAuthToken = async (settings: Settings) => {
    const response = await getAuthToken(settings, {
      grant_type: "refresh_token",
      refresh_token: getValue(StoreKey.AUTH_REFRESH_TOKEN),
      client_id: settings["acl.oidc.client.id"],
    })
    const tokenResponse = await response.json()
    setAuthToken(tokenResponse, settings)
    return tokenResponse
  }

  const setupOAuth2 = async (settings: Settings) => {
    if (!settings["acl.enabled"]) {
      dispatch({ view: View.ready })
      return
    }

    // Proceed with the OAuth2 flow only if it's enabled on the server
    if (settings["acl.oidc.enabled"]) {
      // Loading state is for OAuth2 flow only, as basic auth has no persistence layer, and it's in-memory only
      const authPayload = getValue(StoreKey.AUTH_PAYLOAD)
      const urlParams = new URLSearchParams(window.location.search)
      const code = urlParams.get("code")
      const oauth2Error = new OAuth2Error(
        urlParams.get("error"),
        urlParams.get("error_description"),
      )

      // Subscribe for any subsequent REST 401 responses (incorrect token, etc)
      eventBus.subscribe(EventType.MSG_CONNECTION_UNAUTHORIZED, () => {
        const oauthRedirectCount = getValue(StoreKey.OAUTH_REDIRECT_COUNT)
        // If any prior 401 when oauth2 is enabled has been received
        if (oauthRedirectCount) {
          const count = parseInt(oauthRedirectCount)
          // Something's wrong with the backend consistently rejecting the token.
          // Redirect to a dedicated logout page instead to break the loop.
          if (!isNaN(count) && count >= 5) {
            removeValue(StoreKey.OAUTH_REDIRECT_COUNT)
            logout(true)
            // redirect to /logout to avoid infinite loop
          } else {
            setValue(
              StoreKey.OAUTH_REDIRECT_COUNT,
              JSON.stringify(
                oauthRedirectCount ? parseInt(oauthRedirectCount) + 1 : 1,
              ),
            )
            logout()
          }
          // First time 401
        } else {
          setValue(StoreKey.OAUTH_REDIRECT_COUNT, JSON.stringify(1))
          logout()
        }
      })

      // Clear the 401 auth redirect loop in case the connection is back to normal
      eventBus.subscribe(EventType.MSG_CONNECTION_OK, () => {
        removeValue(StoreKey.OAUTH_REDIRECT_COUNT)
      })

      // User is authenticated already
      if (authPayload !== "") {
        const tokenResponse = JSON.parse(authPayload)
        // Check if the token expired or is about to in 30 seconds
        if (new Date(tokenResponse.expires_at).getTime() - Date.now() < 30000) {
          if (getValue(StoreKey.AUTH_REFRESH_TOKEN) !== "") {
            // if there is a refresh token, go to OAuth2 provider to get fresh tokens
            await refreshAuthToken(settings)
          } else {
            // if there is no refresh token, send the user to the login screen
            logout()
          }
        } else {
          setSessionData(tokenResponse)
        }
      } else {
        // User has just been redirected back from the OAuth2 provider and has the code
        if (code !== null) {
          const state = getValue(StoreKey.OAUTH_STATE)
          if (state) {
            removeValue(StoreKey.OAUTH_STATE)
            const stateParam = urlParams.get("state")
            if (!stateParam || state !== stateParam) {
              // state is missing or there is a mismatch, send user to authenticate again
              logout(true)
              return
            }
          }

          try {
            const code_verifier = getValue(StoreKey.PKCE_CODE_VERIFIER)
            const response = await getAuthToken(settings, {
              grant_type: "authorization_code",
              code,
              code_verifier,
              client_id: settings["acl.oidc.client.id"],
              redirect_uri:
                settings["acl.oidc.redirect.uri"] ||
                window.location.origin + window.location.pathname,
            })
            const tokenResponse = await response.json()
            setAuthToken(tokenResponse, settings)
          } catch (e) {
            throw e
          }
        } else if (oauth2Error.error) {
          // User has just been redirected back from the OAuth2 provider and there is an error
          setErrorMessage(
            oauth2Error.error + ": " + oauth2Error.error_description,
          )
          // Stop loading and display the login state
        } else {
          uiAuthLogin()
        }
      }
    } else if (settings["acl.basic.auth.realm.enabled"]) {
      await basicAuthLogin()
    } else {
      // Subscribe for any subsequent REST 401 responses (incorrect token, etc)
      eventBus.subscribe(EventType.MSG_CONNECTION_UNAUTHORIZED, () => {
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
      dispatch({ view: View.ready })
    } else {
      await basicAuthLogin()
    }
  }

  const uiAuthLogin = () => {
    // Check if user is authenticated already with basic auth
    const token = getValue(StoreKey.REST_TOKEN)
    const basicAuthHeader = getValue(StoreKey.BASIC_AUTH_HEADER)
    if (token || basicAuthHeader) {
      dispatch({ view: View.ready })
    } else {
      // Stop loading and display the login state
      dispatch({ view: View.login })
    }
  }

  const redirectToAuthorizationUrl = (loginWithDifferentAccount?: boolean) => {
    const state = generateState(settings)
    const code_verifier = generateCodeVerifier(settings)
    const code_challenge = generateCodeChallenge(code_verifier)
    window.location.href = getAuthorisationURL({
      settings,
      code_challenge,
      state,
      loginWithDifferentAccount,
      redirect_uri: settings["acl.oidc.redirect.uri"] || window.location.href,
    })
  }

  const logout = (promptForLogin?: boolean) => {
    removeValue(StoreKey.AUTH_PAYLOAD)
    removeValue(StoreKey.REST_TOKEN)
    removeValue(StoreKey.BASIC_AUTH_HEADER)
    if (promptForLogin && settings["acl.oidc.client.id"]) {
      removeSSOUserNameWithClientID(settings["acl.oidc.client.id"])
    }
    dispatch({ view: View.login })
  }

  useEffect(() => {
    if (sessionData) {
      dispatch({ view: View.ready })
    }
  }, [sessionData])

  useEffect(() => {
    // If user has no access to the HTTP protocol, they will receive a 403 error response
    // containing a specific message type. If that happens, we display a full screen error page.
    eventBus.subscribe<ErrorResult>(
      EventType.MSG_CONNECTION_FORBIDDEN,
      (errorPayload) => {
        if (
          errorPayload &&
          errorPayload.error.match(/Access denied.* \[HTTP]/gm)
        ) {
          dispatch({
            view: View.error,
            errorMessage: "Unauthorized to use the Web Console.",
          })
        }
      },
    )

    void setupOAuth2(settings)
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
    [View.error]: () => (
      <Error
        errorMessage={errorMessage}
        onLogout={logout}
        basicAuthEnabled={settings["acl.basic.auth.realm.enabled"] ?? false}
      />
    ),
    [View.login]: () => (
      <Login
        onOAuthLogin={redirectToAuthorizationUrl}
        onBasicAuthSuccess={() => {
          dispatch({ view: View.ready })
        }}
      />
    ),
  }

  return <>{views[state.view]()}</>
}

export const useAuth = () => useContext(AuthContext)
