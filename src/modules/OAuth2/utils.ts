import { Base64 } from "js-base64"
import { Settings } from "../../providers/SettingsProvider/types"
import { AuthPayload, SignInError, TokenResponse } from "./types"
import { DeadlineExceededError, withDeadline } from "../../utils/withDeadline"
import { StoreKey } from "../../utils/localStorage/types"
import { getValue } from "../../utils/localStorage"

export const SIGN_IN_ERROR_TITLE = "Something went wrong."
export const SESSION_EXPIRED_TITLE = "Your SSO session has expired"
const SENTENCE_ENDINGS = [".", "!", "?"]

export const sessionRenewalError = (description?: string): SignInError => {
  const reason = description?.trim() || "Could not renew your SSO session."
  // Identity providers often omit the full stop, e.g. "Token is not active".
  const sentence = SENTENCE_ENDINGS.some((ending) => reason.endsWith(ending))
    ? reason
    : `${reason}.`
  return {
    errorTitle: SESSION_EXPIRED_TITLE,
    errorMessage: `${sentence} Please sign in again.`,
  }
}

type TokenPayload = Partial<{
  grant_type: string
  code: string
  code_verifier: string
  client_id: string
  redirect_uri: string
  refresh_token: string
}>

const getBaseURL = (settings: Settings) => {
  // if there is no host in settings, no need to construct base URL at all
  if (!settings["acl.oidc.host"]) {
    return ""
  }

  // if there is host in settings, we are in legacy mode, and we should construct the base URL
  return `${settings["acl.oidc.tls.enabled"] ? "https" : "http"}://${
    settings["acl.oidc.host"]
  }:${settings["acl.oidc.port"]}`
}

export const getAuthorisationURL = ({
  settings,
  code_challenge = null,
  state = null,
  prompt,
  redirect_uri,
}: {
  settings: Settings
  code_challenge: string | null
  state: string | null
  prompt?: "login" | "none"
  redirect_uri: string
}) => {
  const params = {
    client_id: settings["acl.oidc.client.id"] || "",
    response_type: "code",
    scope: settings["acl.oidc.scope"] || "openid",
    redirect_uri,
  }

  const urlParams = new URLSearchParams(params)
  if (code_challenge) {
    urlParams.append("code_challenge", code_challenge)
    urlParams.append("code_challenge_method", "S256")
  }
  if (state) {
    urlParams.append("state", state)
  }
  if (prompt) {
    urlParams.append("prompt", prompt)
  }

  return (
    getBaseURL(settings) +
    settings["acl.oidc.authorization.endpoint"] +
    "?" +
    urlParams.toString()
  )
}

// Reads the exp claim of a JWT, in milliseconds. The signature is not verified:
// the claim only schedules the refresh, and the server validates the token.
const getJwtExpiration = (jwt: string | undefined) => {
  const payload = jwt?.split(".")[1]
  if (!payload) return undefined
  try {
    const claims = JSON.parse(Base64.decode(payload)) as {
      exp?: unknown
    } | null
    const exp = claims?.exp
    return typeof exp === "number" &&
      !Number.isNaN(new Date(exp * 1000).getTime())
      ? exp * 1000
      : undefined
  } catch {
    return undefined
  }
}

// expires_in is the lifetime of the access token, so an ID token bearer expires
// at its exp claim instead. exp is not rebased onto iat, because some IdPs
// (e.g. Entra ID) backdate iat by several minutes to allow for clock skew.
// Returns undefined when the bearer's expiry is unknown, because a provider may
// omit expires_in.
export const getTokenExpirationDate = (
  tokenResponse: Pick<
    AuthPayload,
    "id_token" | "expires_in" | "groups_encoded_in_token"
  >,
): Date | undefined => {
  const idTokenExpiration = tokenResponse.groups_encoded_in_token
    ? getJwtExpiration(tokenResponse.id_token)
    : undefined
  if (idTokenExpiration !== undefined) return new Date(idTokenExpiration)
  const lifetime = tokenResponse.expires_in
  // Zero is a known, immediately expired lifetime, not an omitted expiry.
  if (lifetime === undefined || !Number.isFinite(lifetime) || lifetime < 0)
    return undefined
  const expiration = new Date(Date.now() + lifetime * 1000)
  return Number.isNaN(expiration.getTime()) ? undefined : expiration
}

// The server validates the bearer; clients share this helper so stale-401
// comparisons use exactly the same authorization value as outgoing requests.
export const getBearerAuthorization = (payload: Partial<AuthPayload>) => {
  const bearer = payload.groups_encoded_in_token
    ? payload.id_token
    : payload.access_token
  return bearer ? `Bearer ${bearer}` : undefined
}

// SSO is tab-local and takes precedence over credentials another tab may save.
export const getStoredCredentialAuthorization = () => {
  const restToken = getValue(StoreKey.REST_TOKEN)
  return restToken
    ? `Bearer ${restToken}`
    : getValue(StoreKey.BASIC_AUTH_HEADER) || undefined
}

export type GrantType = "authorization_code" | "refresh_token"

const MISSING_ID_TOKEN_MESSAGES: Record<GrantType, string> = {
  authorization_code:
    "Your identity provider did not send the information needed to sign you in. Please ask your administrator to check the SSO configuration.",
  refresh_token:
    "Your identity provider did not send the information needed to keep you signed in. You can sign in again, but please ask your administrator to check the SSO configuration to prevent this happening again.",
}

// The server cannot authenticate an ID token bearer without the ID token. OIDC
// lets a refresh response omit it, and without the openid scope there is none.
export const getMissingIdTokenError = (
  tokenResponse: Pick<AuthPayload, "id_token" | "groups_encoded_in_token">,
  grantType: GrantType,
): SignInError | undefined =>
  tokenResponse.groups_encoded_in_token && !tokenResponse.id_token
    ? {
        errorTitle: "Missing ID token",
        errorMessage: MISSING_ID_TOKEN_MESSAGES[grantType],
      }
    : undefined

// Pure normalization: only the response for this grant may supply a bearer;
// only a refresh may retain the previous refresh token. Endpoint expires_at
// fields are never trusted for scheduling.
export const buildInstalledPayload = (
  response: TokenResponse,
  groupsEncodedInToken: boolean | undefined,
  grant: GrantType,
  previous: AuthPayload | null,
): { payload: AuthPayload } | { error: SignInError } => {
  if (!response.access_token) {
    return {
      error:
        grant === "refresh_token"
          ? sessionRenewalError(response.error_description)
          : {
              errorTitle: SIGN_IN_ERROR_TITLE,
              errorMessage:
                response.error_description ??
                "Could not complete the sign-in. Please try again.",
            },
    }
  }
  const payload: AuthPayload = {
    access_token: response.access_token,
    id_token: response.id_token,
    expires_in: response.expires_in,
    token_type: response.token_type ?? "Bearer",
    refresh_token:
      response.refresh_token ??
      (grant === "refresh_token" ? previous?.refresh_token : undefined),
    groups_encoded_in_token: groupsEncodedInToken,
  }
  const error = getMissingIdTokenError(payload, grant)
  return error
    ? { error }
    : {
        payload: {
          ...payload,
          expires_at: getTokenExpirationDate(payload)?.toISOString(),
        },
      }
}

export const getAuthToken = async (
  settings: Settings,
  payload: TokenPayload,
  signal?: AbortSignal,
) => {
  return fetch(
    `${getBaseURL(settings)}${settings["acl.oidc.token.endpoint"]}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(payload),
      signal,
    },
  )
}

// Sign-in aborts the request at this deadline. Refresh only releases waiting
// queries here; its separate network deadline allows a late rotated token.
export const TOKEN_REQUEST_TIMEOUT_MS = 10_000

type CodeExchange =
  | { tokenResponse: TokenResponse }
  | { signInError: SignInError }

const signInFailure = (errorMessage: string): CodeExchange => ({
  signInError: { errorTitle: SIGN_IN_ERROR_TITLE, errorMessage },
})

const SIGN_IN_TIMED_OUT = `The identity provider did not respond within ${TOKEN_REQUEST_TIMEOUT_MS / 1000} seconds. Please try again.`

const requestTokens = async (
  settings: Settings,
  payload: TokenPayload,
  signal: AbortSignal,
): Promise<CodeExchange> => {
  let response: Response
  try {
    response = await getAuthToken(settings, payload, signal)
  } catch {
    return signInFailure(
      signal.aborted
        ? SIGN_IN_TIMED_OUT
        : "Could not reach the identity provider to complete the sign-in. Please try again.",
    )
  }
  try {
    return { tokenResponse: await readAuthTokenResponse(response) }
  } catch (error) {
    // Do not log the response body: it may contain credentials.
    console.error("Invalid identity-provider token response", error)
    return signInFailure(
      signal.aborted
        ? SIGN_IN_TIMED_OUT
        : response.status >= 200 && response.status < 300
          ? "The identity provider returned an invalid token response. Please ask your administrator to check the SSO configuration."
          : `The identity provider returned an unexpected response (HTTP ${response.status}). Please try again.`,
    )
  }
}

// Exchanges the authorization code for tokens. A request that fails or times
// out without an OAuth response resolves with the error to show, because the
// sign-in would otherwise stop on a blank screen. The token response itself
// may still be an OAuth error.
export const exchangeAuthorizationCode = async (
  settings: Settings,
  payload: TokenPayload,
): Promise<CodeExchange> => {
  const controller = new AbortController()
  try {
    return await withDeadline(
      requestTokens(settings, payload, controller.signal),
      TOKEN_REQUEST_TIMEOUT_MS,
      () => controller.abort(),
    )
  } catch (error) {
    if (error instanceof DeadlineExceededError) {
      return signInFailure(SIGN_IN_TIMED_OUT)
    }
    throw error
  }
}

export const readAuthTokenResponse = async (
  response: Response,
  deadlineSignal?: AbortSignal,
): Promise<TokenResponse> => {
  let body: unknown
  try {
    body = await response.json()
  } catch {
    // JSON parser errors can include snippets of the body (and credentials).
    // Keep the diagnostic safe for the sign-in logger.
    throw new Error("Invalid token response: expected JSON")
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new Error("Invalid token response: expected an object")
  }
  const fields = body as Record<string, unknown>
  const tokenResponse: TokenResponse = {}
  for (const key of [
    "access_token",
    "id_token",
    "refresh_token",
    "token_type",
    "error",
    "error_description",
  ] as const) {
    const value = fields[key]
    // Some IdPs return JSON null for omitted optional fields.
    if (value === undefined || value === null) continue
    if (typeof value !== "string") {
      throw new Error(`Invalid token response: ${key} must be a string`)
    }
    tokenResponse[key] = value
  }
  // Entra's legacy/B2C endpoints can serialise this lifetime as a string.
  // An unusable optional lifetime means unknown expiry, not invalid tokens.
  const lifetime =
    typeof fields.expires_in === "string" && /^\d+$/.test(fields.expires_in)
      ? Number(fields.expires_in)
      : fields.expires_in
  if (
    typeof lifetime === "number" &&
    Number.isFinite(lifetime) &&
    lifetime >= 0 &&
    !Number.isNaN(new Date(Date.now() + lifetime * 1000).getTime())
  ) {
    tokenResponse.expires_in = lifetime
  }
  // Preserve a late rotated refresh token, but don't let a late OAuth error
  // log out a session whose waiting queries have already been released.
  if (deadlineSignal?.aborted && !tokenResponse.access_token) {
    throw new DeadlineExceededError()
  }
  return tokenResponse
}

export const hasUIAuth = (settings: Settings) =>
  settings["acl.enabled"] && !settings["acl.basic.auth.realm.enabled"]

export const getSSOUserNameWithClientID = (clientId: string) => {
  return localStorage.getItem(`${StoreKey.SSO_USERNAME}.${clientId}`) ?? ""
}

export const setSSOUserNameWithClientID = (clientId: string, value: string) => {
  localStorage.setItem(`${StoreKey.SSO_USERNAME}.${clientId}`, value)
}

export const removeSSOUserNameWithClientID = (clientId: string) => {
  localStorage.removeItem(`${StoreKey.SSO_USERNAME}.${clientId}`)
}
