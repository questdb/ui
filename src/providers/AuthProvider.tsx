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
  getSSOUserNameWithClientID,
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
import { ssoAuthState } from "../modules/OAuth2/ssoAuthState"

type ContextProps = {
  sessionData?: Partial<AuthPayload>,
  logout: (promptForLogin?: boolean) => void,
  refreshAuthToken: (settings: Settings, refreshToken: string | undefined) => Promise<AuthPayload>,
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
      ssoAuthState.setAuthPayload(tokenResponse)
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

  const refreshAuthToken = async (settings: Settings, refreshToken: string | undefined) => {
    const response = await getAuthToken(settings, {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
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

    // Proceed with the OAuth2 flow only if it is enabled on the server
    if (settings["acl.oidc.enabled"]) {

      // Subscribe for any subsequent REST 401 responses (incorrect token, etc)
      eventBus.subscribe(EventType.MSG_CONNECTION_UNAUTHORIZED, () => {
        const oauthRedirectCount = getValue(StoreKey.OAUTH_REDIRECT_COUNT)
        // If any prior 401 when oauth2 is enabled has been received
        if (oauthRedirectCount) {
          const count = parseInt(oauthRedirectCount)
          // Something is wrong with the backend, it is consistently rejecting the token.
          // Redirect to a dedicated logout page instead to break the loop.
          if (!isNaN(count) && count >= 5) {
            // redirect to /logout and force user authentication to avoid infinite loop
            removeValue(StoreKey.OAUTH_REDIRECT_COUNT)
            logout(true)
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
        if (state) {
          removeValue(StoreKey.OAUTH_STATE)
          const stateParam = urlParams.get("state")
          if (!stateParam || state !== stateParam) {
            // state is missing or there is a mismatch, user has to re-authenticate
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
          await startServerSession(tokenResponse)
        } catch (e) {
          throw e
        }
      } else if (oauth2Error.error) {
        // User has just been redirected back from the OAuth2 provider and there is an error
        const previousPrompt = getValue(StoreKey.OAUTH_PROMPT)
        removeValue(StoreKey.OAUTH_PROMPT)
        if (previousPrompt === "none") {
          // If we requested authorization code silently (prompt=none), it could be that the user
          // does not have an active SSO session, so let's send the user to re-authenticate (prompt=login)
          redirectToAuthorizationUrl()
        } else {
          // If the error is not in response for a silent authorization code request, display the error
          setErrorMessage(oauth2Error.error + ": " + oauth2Error.error_description)
          dispatch({ view: View.error })
        }
      } else if (ssoUsername && !getValue(StoreKey.REST_TOKEN)) {
        // No REST token, so it is a page reload for an SSO user
        // We should try to request a token silently
        redirectToAuthorizationUrl("none")
      } else {
        // Stop loading and display the login state
        uiAuthLogin()
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

  const startServerSession = async (tokenResponse: AuthPayload) => {
    // execute a simple query with session=true
    await fetch(
      `exec?query=select 2&session=true`,
      {
        headers: {
          Authorization: `Bearer ${tokenResponse.groups_encoded_in_token ? tokenResponse.id_token : tokenResponse.access_token}`,
        },
      },
    )
  }

  const destroyServerSession = () => {
    // execute a simple query with session=false
    fetch(`exec?query=select 2&session=false`).catch(
      // ignore result
    )
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

  const redirectToAuthorizationUrl = (prompt?: "login" | "none") => {
    const state = generateState(settings)
    const code_verifier = generateCodeVerifier(settings)
    const code_challenge = generateCodeChallenge(code_verifier)
    setValue(StoreKey.OAUTH_PROMPT, prompt ?? "")
    window.location.href = getAuthorisationURL({
      settings,
      code_challenge,
      state,
      prompt,
      redirect_uri: settings["acl.oidc.redirect.uri"] || window.location.href,
    })
  }

  const logout = (promptForLogin?: boolean) => {
    ssoAuthState.clearAuthPayload()
    removeValue(StoreKey.OAUTH_PROMPT)
    removeValue(StoreKey.REST_TOKEN)
    removeValue(StoreKey.BASIC_AUTH_HEADER)
    if (promptForLogin && settings["acl.oidc.client.id"]) {
      removeSSOUserNameWithClientID(settings["acl.oidc.client.id"])
    }
    destroyServerSession()
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
        onOAuthLogin={(loginWithDifferentAccount) => {
          redirectToAuthorizationUrl(loginWithDifferentAccount ? "login" : undefined)
        }}
        onBasicAuthSuccess={() => {
          dispatch({ view: View.ready })
        }}
      />
    ),
  }

  return <>{views[state.view]()}</>
}

export const useAuth = () => useContext(AuthContext)
