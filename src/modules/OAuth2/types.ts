export type AuthPayload = {
  access_token: string
  id_token?: string
  refresh_token?: string
  token_type: string
  // The access token's lifetime. OAuth only recommends it: an ID token bearer
  // expires at its exp claim instead.
  expires_in?: number
  // Absent when the bearer's expiry is unknown. Such a token is never
  // refreshed: it is used until the server rejects it, then the user signs in.
  expires_at?: string
  groups_encoded_in_token?: boolean
}

export type TokenResponse = Partial<AuthPayload> & {
  error?: string
  error_description?: string
}

export type SignInError = { errorTitle: string; errorMessage: string }

export type LogoutOptions = Partial<SignInError> & {
  promptForLogin?: boolean
  isDisconnection?: boolean
  reload?: boolean
  clearSSOSession?: boolean
}

export class AuthSessionEndedError extends Error {
  constructor() {
    super("Your session has ended. Please sign in again.")
    this.name = "AuthSessionEndedError"
  }
}
