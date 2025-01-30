import { Settings } from "../../providers/SettingsProvider/types"

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
  login,
  redirect_uri,
}: {
  settings: Settings
  code_challenge: string | null
  login?: boolean
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
  if (login) {
    urlParams.append("prompt", "login")
  }

  return (
    getBaseURL(settings) +
    settings["acl.oidc.authorization.endpoint"] +
    "?" +
    urlParams
  )
}

export const getTokenExpirationDate = (expires_in: number) => {
  return new Date(new Date().getTime() + expires_in * 1000)
}

export const getAuthToken = async (
  settings: Settings,
  payload: TokenPayload,
) => {
  return fetch(
    `${getBaseURL(settings)}${settings["acl.oidc.token.endpoint"]}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(payload),
    },
  )
}

export const hasUIAuth = (settings: Settings) =>
  settings["acl.enabled"] && !settings["acl.basic.auth.realm.enabled"]
